# 🛠️ PostmanSync

**PostmanSync** is a powerful tool to automatically synchronize a read-only public Postman collection to multiple target workspaces.

It intelligently detects changes, supports flexible scheduling, handles rate-limiting, and lets you plug into custom event hooks. Perfect for syncing development, staging, and production environments from a single source.

---

## 🚀 Features

- 🔄 Sync public Postman collections to one or many workspaces
- 🕒 Schedule-based syncing per workspace or globally
- 🧪 Dry-run mode for safe testing
- 📡 Events for changes, insertions, updates, and errors
- 🔁 Built-in rate-limiter with API key rotation
- 🪵 Custom logger support with adjustable `logLevel`

---

## 🔧 Built With

PostmanSync is powered by a set of modern, lightweight, and reliable open-source tools:

- **[pino](https://github.com/pinojs/pino)** – For performant and flexible structured logging (with optional `pino-pretty`)
- **[axios](https://github.com/axios/axios)** – For making robust and promise-based HTTP requests
- **[fast-json-patch](https://github.com/Starcounter-Jack/JSON-Patch)** – To deeply compare collection JSONs and generate accurate change diffs
- **[node:events](https://nodejs.org/api/events.html)** – Native event system for emitting sync lifecycle events
- **TypeScript** – Entire codebase is written in TypeScript for strong type-safety and DX

These tools work together to ensure PostmanSync is fast, extensible, and production-ready.

## ⚙️ Configuration

PostmanSync accepts a single configuration object with the following fields:

### PostmanSyncOptions:

- **readOnlyUrl** (`string`)  
  **Required.** The public Postman collection URL (must include API key). This is the source of truth for syncing.

- **targetWorkspaces** (`WorkspaceConfig[]`)  
  **Required.** An array of workspaces that the collection should be pushed to.

- **dryRun** (`boolean`)  
  Optional. If `true`, no actual sync is performed. Only change detection and logging occur.  
  Default: `false`

- **minIntervalMs** (`number`)  
  Optional. Minimum milliseconds to wait between sync loop executions.  
  Default: `3000`

- **syncSchedule** (`SyncSchedule[]`)  
  Optional. A global sync schedule. Can be overridden by per-workspace schedules.

- **logger** (`Logger`)  
  Optional. A custom logger implementing `.info()`, `.warn()`, and `.error()` methods (e.g., `winston`, `pino`, etc.)

- **storageDir** (`string`)  
  Optional. Path to the directory where internal sync artifacts will be saved  
  (e.g., diff cache, auto-created collection logs, etc.)  
  Default: `.postman-sync-storage`

  > 📁 This directory is used to store:
  > - Auto-created collection logs (`auto_created.log`)
  > - Cached collection data for change detection
  > - Any other persistent runtime metadata
  >
  > ⚠️ Make sure to add `storageDir` (e.g., `.postman-sync-storage/`) to your `.gitignore`  
  > to avoid committing logs or temporary sync data to your repository.

- **enableJsonDiff** (`boolean`)  
  Optional. If `true`, enables deep comparison of collection content using JSON diff.  
  Useful for tracking detailed changes (inserted, deleted, modified requests, etc.)  
  Default: `false`

  > 💡 When enabled, PostmanSync will persist the latest collection content in the `storageDir`  
  > and compare it against the new version during each sync attempt.  
  > Diff data will be emitted in the `change` event.

- **logLevel** (`"silent" | "error" | "warn" | "info" | "debug"`)  
  Optional. Adjusts the verbosity of logs when using the built-in logger or wraps logging output when a custom logger is provided.  
  Default: `"info"`

  > If a `customLogger` is provided and it has a `.level` property, PostmanSync will attempt to set its level based on `logLevel`.

### WorkspaceConfig:

- **id** (`string`)  
  The Postman workspace ID where the collection should be synced.

- **apiKeys** (`string[]`)  
  One or more Postman API keys. These are used in rotation in case of rate limiting.

- **collectionUid** (`string`)  
  Optional. If omitted and `preventAutoCreate` is false or undefined, a new collection will be created.
  > ℹ️ **Auto-created Collections:**  
  > If `collectionUid` is not provided and auto-creation is allowed, a new collection will be created in the specified workspace.  
  > The newly created collection's UID and associated metadata (e.g. workspaceId, readonlyUrl) will be logged to `.${storageDir}/auto_created.log`.  
  > This UID will be used **only for the lifetime of the current process**.  
  > If the process is restarted, a new collection will be created again **unless you manually provide the original UID** in the config.

  ✅ It is **strongly recommended** to copy the auto-created collection UID from the log file and set it explicitly in your configuration using `collectionUid`.  
  This ensures consistent syncing and avoids unnecessary collection sprawl in your Postman workspace.
- 
- **preventAutoCreate** (`boolean`)  
  Optional. If `true`, collection will NOT be auto-created. Useful for strict environments.

- **tag** (`string`)  
  Optional. Label for this workspace used in logs/events 

- **enabled** (`boolean`)  
  Optional. If `false`, the workspace will be skipped.  
  Default: `true`

- **syncSchedule** (`SyncSchedule[]`)  
  Optional. Overrides the global schedule for this specific workspace.

---

### SyncSchedule:

- **startHour** (`number`)  
  Hour of day (0–23) when syncing should start.

- **endHour** (`number`)  
  Hour of day (0–23) when syncing should stop (non-inclusive).

- **intervalMinutes** (`number`)  
  How often to attempt sync during the window. Minimum: `0.5` (30 seconds)

---
Note: If a workspace has its own syncSchedule, it overrides the global syncSchedule. This behavior triggers the `scheduleOverride` event.

## ☕ Support

We’re a small group of developers building open-source tools to make dev life easier.  
If you find **PostmanSync** helpful, feel free to [buy us a coffee](https://buymeacoffee.com/innoviora) to support our journey.  
**We truly thank you! 💛**

## 📦 Installation

```bash
  npm install postman-sync
```

## Usage

```typescript
import {PostmanSync} from "postman-sync";

import winston from "winston";

const logger = winston.createLogger({
    level: "warn", // default level
    format: winston.format.simple(),
    transports: [
        new winston.transports.Console()
    ]
});

const sync = new PostmanSync({
    readOnlyUrl: "https://api.postman.com/collections/abcd1234?apikey=readonlykey",
    dryRun: false,
    minIntervalMs: 5000,
    logger, // Optional
    logLevel : "silent", 
    storageDir : "custom-storage-dir",
    enableJsonDiff : true,
    syncSchedule: [
        {startHour: 9, endHour: 17, intervalMinutes: 10}
    ],
    targetWorkspaces: [
        {
            id: "workspace-dev-001",
            apiKeys: ["dev-key-1", "dev-key-2"],
            collectionUid: "xyz123",
            tag: "dev",
            syncSchedule: [
                {startHour: 8, endHour: 20, intervalMinutes: 15}
            ]
        },
        {
            id: "workspace-prod-002",
            apiKeys: ["prod-api-key-1","prod-api-key-2","prod-api-key-3"],
            preventAutoCreate: true,
            tag: "prod"
        },
        {
            id: "workspace-stage-003",
            apiKeys: ["stage-api-key"],
            collectionUid: "abcd123",
            tag: "stage",
            syncSchedule: [
                {startHour: 9, endHour: 19, intervalMinutes: 1},
                {startHour: 19, endHour: 23, intervalMinutes: 5},
                {startHour: 23, endHour: 9, intervalMinutes: 30}
            ]
        }
    ]
});

sync.on("syncStart", () => {
    console.log("🔁 Sync started");
});

sync.on("change", (collection, diff) => { 
    console.log("📦 Collection changed:", diff);
});

sync.on("insert", (workspaceId, collection) => {
    console.log(`✅ Inserted into workspace ${workspaceId}`);
});

sync.on("update", (workspaceId, collection) => {
    console.log(`✏️ Updated workspace ${workspaceId}`);
});

sync.on("noChange", () => {
    console.log("🟢 No change in collection");
});

sync.on("error", (error, context) => {
    console.error(`❌ Error in ${context}:`, error);
});

sync.on("scheduleOverride", ({ targetId, overriddenBy }) => {
    console.warn(`⚠️ Schedule override by ${overriddenBy} for workspace ${targetId}`);
});
    
sync.start();
```


