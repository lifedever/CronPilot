<p align="right">
  <a href="README.zh-CN.md">中文</a>
</p>

<h1 align="center">CronPilot</h1>

<p align="center">
  <strong>A visual desktop tool for managing local crontab</strong><br>
  Say goodbye to manual crontab editing — manage your scheduled tasks with a graphical interface
</p>

<p align="center">
  <a href="https://github.com/lifedever/CronPilot/releases/latest">
    <img src="https://img.shields.io/github/v/release/lifedever/CronPilot?style=flat-square&color=34D399&label=Latest%20Release" alt="Latest Release">
  </a>
  <a href="https://github.com/lifedever/CronPilot/releases">
    <img src="https://img.shields.io/github/downloads/lifedever/CronPilot/total?style=flat-square&color=7C3AED&label=Downloads" alt="Downloads">
  </a>
  <img src="https://img.shields.io/badge/platform-macOS-blue?style=flat-square" alt="Platform">
  <a href="https://github.com/lifedever/CronPilot/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/lifedever/CronPilot?style=flat-square" alt="License">
  </a>
</p>

## Screenshots

| Dashboard | Job Management | Conflict Detection |
|:---:|:---:|:---:|
| <img src="public/screenshot-dashboard.png" width="280" /> | <img src="public/screenshot-jobs.png" width="280" /> | <img src="public/screenshot-conflict.png" width="280" /> |

## Features

- **Job Management** - Create, edit, delete, enable/disable scheduled tasks
- **Visual Cron Builder** - Three modes (Simple / Advanced / Raw), preset shortcuts, real-time validation, next execution preview
- **Execution Logs** - Automatically captures stdout/stderr, exit codes, and execution duration (millisecond precision) for cron runs; supports manual trigger with real-time log streaming
- **Crontab Conflict Detection** - Detects differences between system crontab and app data on startup, offering four resolution strategies: keep local, keep app, merge, or skip (similar to Git conflict resolution)
- **System Crontab Sync** - Changes are automatically synced to system crontab; supports one-click import of existing tasks
- **Dashboard** - Task statistics, recent activity (paginated), log cleanup (by time range), auto/manual refresh
- **Bilingual (EN/ZH)** - Automatically follows system language with manual switching support
- **Dark Mode** - Light / Dark / System themes
- **Command Validation** - Checks script executability before saving; warns about dangerous commands
- **Data Backup** - Export/import task configurations; automatic crontab snapshots before modifications

## Development

### Prerequisites

- [Rust](https://rustup.rs/)
- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/)
- macOS: Xcode Command Line Tools
- Linux: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`

### Getting Started

```bash
# Install dependencies
pnpm install

# Start development (frontend HMR + Rust backend)
pnpm tauri dev
```

### Build

```bash
# Production build
pnpm tauri build
```

Build artifacts are located in `src-tauri/target/release/bundle/`:

- macOS: `.dmg` / `.app`
- Linux: `.deb` / `.AppImage`

### Project Structure

```text
src/          # React frontend
src-tauri/    # Rust backend (Tauri)
```

## Sponsor

If CronPilot is helpful to you, feel free to [sponsor](https://lifedever.github.io/sponsor/) the developer.
