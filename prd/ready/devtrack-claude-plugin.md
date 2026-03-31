---
missionId: ~
---

# DevTrack Claude Code Plugin

**Author:** Josh  **Date:** 2026-03-28  **Status:** Draft

## 1. Context & Background

DevTrack tracks SDLC state, content pipelines, and PR queues across multiple repos. Its CLI is the bridge between local repos and the DevTrack API — hooks fire CLI commands to push events, and developers use CLI commands to check status and sync state.

Today the CLI is a Go binary that users must build from source (`cd cli && go build`) and manually install hooks via `devtrack hooks install`, which patches `~/.claude/settings.json` and writes git hook scripts. This worked for a single developer, but it doesn't scale to distribution. There's no versioning, no auto-update, and no discoverability inside Claude Code.

The A(i)-Team plugin has already solved this exact distribution problem with a proven pattern: `plugin.json` metadata, a self-updating bash wrapper that downloads platform-specific binaries from GitHub releases, declarative `hooks.json` for Claude Code integration, slash commands for discoverability, and semantic-release for version synchronization across plugin, CLI, and container. DevTrack should adopt this pattern wholesale rather than inventing its own.

**Why now:** DevTrack is approaching the point where other projects need to onboard. Without a plugin install path, every new repo requires manual CLI compilation and hook wiring — a friction that will prevent adoption.

## 2. Problem Statement

**Who:** Developers who want to track their repos with DevTrack.

**What breaks today:**

- **No distribution mechanism.** The CLI lives inside the DevTrack repo as source code. Users must clone the repo, have Go installed, and run `go build`. There's no versioned binary, no release pipeline, no auto-update.
- **Manual hook installation.** `devtrack hooks install` directly mutates `~/.claude/settings.json` and writes git hook scripts. This is fragile — it can conflict with other tools, there's no uninstall path that's reliable, and it's invisible to Claude Code's plugin system.
- **No discoverability.** Once installed, users must remember CLI command names. There are no slash commands, no skill descriptions, nothing that surfaces DevTrack capabilities inside Claude Code.
- **No version coordination.** The CLI version, API version, and hook scripts are not kept in sync. A user can run an old CLI against a new API with no warning.

## 3. Target Users & Use Cases

| User | Use Case |
|------|----------|
| Developer onboarding a new repo | Runs `/devtrack:setup` to register the repo, configure hooks, and verify API connectivity — no Go toolchain required |
| Developer checking project state | Uses `/devtrack:status` or `/devtrack:dashboard` from within Claude Code, with commands discoverable via slash completion |
| DevTrack maintainer shipping a CLI update | Merges a PR to main; semantic-release handles version bump, binary build, and plugin metadata sync automatically |
| Developer on a new machine | Installs the plugin once; the wrapper script auto-downloads the correct platform binary on first use |

## 4. Goals & Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| Zero-friction install | Steps from "no DevTrack" to "hooks firing" | 2 commands: plugin install + `/devtrack:setup` |
| Auto-updating CLI | User action required for CLI updates | None — wrapper script handles it transparently |
| Version coherence | Plugin version, CLI version, and API compatibility stay in sync | Single semantic-release pipeline drives all version bumps |
| Discoverability | DevTrack commands surfaced in Claude Code | All convenience commands available as `/devtrack:*` slash commands |

## 5. Scope

### In Scope

- **Repo reorganization.** Move the Next.js application (App Router pages, components, lib, prisma, config files) into a `web/` subdirectory. The repo root becomes the plugin surface with a clean layout.
- **Plugin packaging structure.** Add `.claude-plugin/plugin.json`, `marketplace.json`, and the standard plugin layout at the repo root. The CLI source stays in `cli/`, the Next.js app lives in `web/`.
- **Self-updating CLI wrapper.** A `bin/devtrack` bash script that checks `minCliVersion` from `plugin.json`, downloads platform-specific binaries from GitHub releases, and delegates execution. Same pattern as the A(i)-Team's `bin/ateam`.
- **Declarative hooks via `hooks.json`.** Replace the imperative `devtrack hooks install` approach with a `hooks/hooks.json` file that Claude Code loads automatically when the plugin is installed. Covers session-start, session-end, and post-tool-use event tracking.
- **Slash commands.** Create `commands/*.md` files for: `setup`, `status`, `dashboard`, `sync`, `prs`. These wrap the underlying CLI calls with Claude Code skill descriptions.
- **Setup command (`/devtrack:setup`).** Interactive setup that creates `project.yaml`, registers the project with the API (subsuming `devtrack register`), writes `.claude/settings.local.json` env vars (`DEVTRACK_API_URL`, `DEVTRACK_API_KEY`), verifies API connectivity, and injects DevTrack instructions into `CLAUDE.md`.
- **GitHub release workflow.** Semantic-release pipeline that on merge to main: determines next version from conventional commits, builds CLI binaries for 4 platforms (darwin/linux x amd64/arm64), uploads them as release assets, and bumps `plugin.json`/`marketplace.json` versions via a bump script.
- **Version sync tooling.** A `scripts/bump-plugin-version.sh` called by semantic-release to update plugin metadata files, mirroring the A(i)-Team pattern.
- **CLI build with version injection.** Go build step that injects the release version via `-ldflags "-X cmd.Version=$VERSION"` so `devtrack --version` reports the correct version and the wrapper script can compare against `minCliVersion`.

### Out of Scope

- **Rewriting the CLI.** The existing Go/Cobra CLI and swagger-jack codegen workflow stay as-is. This PRD is about packaging and distribution, not functionality changes.
- **New CLI commands.** No new commands are added. Existing convenience commands (`status`, `dashboard`, `sync`, `prs`, `event`) are wrapped as slash commands but their implementation doesn't change. `register` is subsumed by `/devtrack:setup` and becomes an internal implementation detail.
- **Git hooks.** The current git hook installation (`post-commit`, `post-checkout`, etc.) is orthogonal to Claude Code plugin hooks. Git hooks may continue to be installed by `/devtrack:setup` but are not part of the plugin's `hooks.json`.
- **Docker/container packaging for the DevTrack API.** The API already has its own deployment. This PRD doesn't add a `docker-compose.yml` to the plugin (unlike A(i)-Team which ships kanban-viewer this way).
- **Marketplace submission.** The plugin will be installable via git submodule initially. Marketplace listing is a future step.
- **MCP server.** The CLI-over-Bash pattern is sufficient. No MCP server needed.

## 6. Requirements

### Repo Layout

- The Next.js application shall be moved into `web/` (including `app/`, `components/`, `lib/`, `prisma/`, `types/`, `specs/`, `__tests__/`, `public/`, `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `docker-compose.yml`, `Dockerfile.dev`, and all other web-app config files).
- The repo root shall contain only plugin structure (`.claude-plugin/`, `bin/`, `commands/`, `hooks/`, `scripts/`), the CLI source (`cli/`), PRDs (`prd/`), docs (`docs/`), and repo-level files (`README.md`, `CLAUDE.md`, `.github/`, `.gitignore`).
- The target layout shall be:
  ```
  DevTrack/
  ├── .claude-plugin/        # Plugin metadata
  ├── .github/               # CI/CD workflows
  ├── bin/                   # CLI wrapper script
  ├── cli/                   # Go CLI source
  ├── commands/              # Slash command definitions
  ├── hooks/                 # Plugin hooks
  ├── scripts/               # Version sync tooling
  ├── prd/                   # Product requirements
  ├── docs/                  # Documentation
  ├── web/                   # Next.js application
  │   ├── app/               # App Router pages
  │   ├── components/
  │   ├── lib/
  │   ├── prisma/
  │   ├── types/
  │   ├── specs/
  │   ├── __tests__/
  │   ├── public/
  │   ├── package.json
  │   └── ...
  ├── CLAUDE.md
  ├── README.md
  └── .gitignore
  ```

### Plugin Structure

- The plugin shall contain `.claude-plugin/plugin.json` with `name`, `version`, and `minCliVersion` fields.
- The plugin shall contain `.claude-plugin/marketplace.json` with repository, description, and keyword metadata.
- The plugin directory layout shall follow the standard Claude Code plugin structure: `.claude-plugin/`, `bin/`, `commands/`, `hooks/`, `scripts/`.

### CLI Distribution

- The plugin shall include a `bin/devtrack` bash wrapper script that auto-downloads the correct platform binary on first invocation.
- The wrapper shall compare the installed binary version against `minCliVersion` from `plugin.json` and re-download if the installed version is older.
- The wrapper shall support darwin/arm64, darwin/amd64, linux/arm64, and linux/amd64 platforms.
- The wrapper shall download binaries from GitHub releases at a configurable repository URL.
- The wrapper shall send all status/progress messages to stderr so JSON output from the real binary is never corrupted.
- The downloaded binary shall be placed at `bin/devtrack-bin` and gitignored.

### Hooks

- The plugin shall include a `hooks/hooks.json` that registers Claude Code hooks for session lifecycle and tool use tracking.
- Session-start hooks shall call `devtrack event session-start`.
- Session-end (Stop) hooks shall call `devtrack event session-end`.
- Post-tool-use hooks shall call `devtrack event` with appropriate context for commit tracking.
- All hooks shall fail silently (`|| true`) to never block Claude Code operation.
- Hooks shall infer `project.yaml` path from `git rev-parse --show-toplevel`.

### Slash Commands

- `/devtrack:setup` shall create `project.yaml`, register the project with the DevTrack API (find-or-create by name, subsuming `devtrack register`), configure env vars in `.claude/settings.local.json`, verify API connectivity, and optionally inject instructions into `CLAUDE.md`.
- `/devtrack:status` shall display current project status using the CLI's `status` command.
- `/devtrack:dashboard` shall display cross-project overview using the CLI's `dashboard` command.
- `/devtrack:sync` shall trigger a full state sync for the current repo.
- `/devtrack:prs` shall display the PR queue across projects.

### Release Pipeline

- The GitHub release workflow shall use semantic-release to determine version from conventional commits.
- The workflow shall build Go CLI binaries for 4 platform/arch combinations with the version injected via ldflags.
- The workflow shall upload binaries as GitHub release assets.
- The workflow shall run `scripts/bump-plugin-version.sh` to update `plugin.json` and `marketplace.json` versions in sync.
- The workflow shall use commitlint to enforce conventional commit messages on PRs.

### Configuration

- The plugin shall read `DEVTRACK_API_URL` and `DEVTRACK_API_KEY` from environment variables (set in `.claude/settings.local.json`).
- `/devtrack:setup` shall auto-detect repo context (git remote URL, existing `project.yaml`) to minimize user input.
- The plugin shall support a `devtrack.config.json` for project-specific settings, analogous to A(i)-Team's `ateam.config.json`.

## 7. Risks & Open Questions

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Existing `devtrack hooks install` users need migration path | Users with manually patched `~/.claude/settings.json` will have duplicate hooks after installing the plugin | `/devtrack:setup` shall detect and clean up legacy hook entries from settings.json |
| Release workflow must build CLI from `cli/` in the same repo | If the Go build breaks, plugin releases are blocked | CI runs Go build on every PR; release only triggers on main merge after CI passes |
| Moving Next.js app to `web/` breaks existing deployment paths | Docker builds, CI workflows, and import paths all reference root-level files | Update Dockerfile, docker-compose, CI workflows, and any absolute import paths in a single coordinated commit. Existing Kubernetes manifests may need build context updates. |

### Open Questions

1. **Should the release pipeline version the plugin independently from the Next.js app?** The plugin and API live in the same repo. Semantic-release will trigger on any conventional commit — should API-only changes bump the plugin version? One option: use path-scoped release triggers (only release plugin when `cli/`, `.claude-plugin/`, `commands/`, `hooks/` change).
