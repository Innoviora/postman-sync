import axios, {HttpStatusCode} from "axios";
import {EventEmitter} from "node:events";
import {PostmanApiClient} from "./PostmanApiClient";
import {RateLimiter} from "./RateLimiter";
import {CollectionWatcher} from "./CollectionWatcher";
import {createLogger} from "./logger";
import {
    PostmanSyncOptions,
    SyncSchedule,
    WorkspaceConfig,
} from "./types";
import path from "node:path";
import * as fs from "node:fs";

export class PostmanSync extends EventEmitter {
    private logger: any;
    private watcher!: CollectionWatcher;
    private readonly dryRun: boolean = false;
    private targetWorkspacesMap: Map<string, WorkspaceConfig> = new Map();
    private isSyncing: boolean = false;
    private running: boolean = false;
    private readonly scheduleConfig?: SyncSchedule[];
    private lastSyncTimes: Map<string, number> = new Map();

    constructor(private options: PostmanSyncOptions) {
        super();
        this.validateOptions(options);
        this.logger = createLogger(options.logger, options.logLevel);
        this.watcher = new CollectionWatcher({
            enableJsonDiff: Boolean(options.enableJsonDiff),
            storageDir: options.storageDir,
            mainCollectionUId: this.extractCollectionId(options.readOnlyUrl)
        })
        if (options.enableJsonDiff) this.watcher.loadPreviousState()

        this.dryRun = options.dryRun ?? false;
        this.scheduleConfig = options.syncSchedule;
        for (const ws of options.targetWorkspaces) {
            this.targetWorkspacesMap.set(ws.id, ws);
        }
    }

    private validateOptions(options: PostmanSyncOptions) {
        const logPrefix = "[PostmanSyncOptions]";

        if (
            typeof options !== "object" ||
            options === null ||
            Array.isArray(options)
        ) {
            throw new Error(`${logPrefix} options must be a non-null object.`);
        }

        if (typeof options.readOnlyUrl !== "string" || options.readOnlyUrl.trim() === "") {
            throw new Error(`${logPrefix} 'readOnlyUrl' must be a non-empty string.`);
        }

        try {
            const urlObj = new URL(options.readOnlyUrl.trim());
            const postmanUrlPattern = /^https:\/\/api\.postman\.com\/collections\/[a-zA-Z0-9\-]+\?access_key=PMAT-[a-zA-Z0-9]+$/;
            if (!postmanUrlPattern.test(options.readOnlyUrl.trim())) {
                throw new Error();
            }
        } catch {
            throw new Error(`${logPrefix} 'readOnlyUrl' must be a valid Postman public shareable link in the correct format.`);
        }

        if (!Array.isArray(options.targetWorkspaces) || options.targetWorkspaces.length === 0) {
            throw new Error(`${logPrefix} 'targetWorkspaces' must be a non-empty array.`);
        }

        for (const [i, workspace] of options.targetWorkspaces.entries()) {
            if (typeof workspace.id !== "string" || workspace.id.trim() === "") {
                throw new Error(`${logPrefix} targetWorkspaces[${i}].id must be a non-empty string.`);
            }

            const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (!uuidV4Regex.test(workspace.id.trim())) {
                throw new Error(`${logPrefix} targetWorkspaces[${i}].id must be a valid UUID.`);
            }

            const apiKeyRegex = /^PMAK-[0-9a-f]{24}-[0-9a-f]{34}$/i;
            if (!Array.isArray(workspace.apiKeys) || workspace.apiKeys.length === 0) {
                throw new Error(`${logPrefix} targetWorkspaces[${i}].apiKeys must be a non-empty array.`);
            }

            for (const [k, key] of workspace.apiKeys.entries()) {
                if (typeof key !== "string" || !apiKeyRegex.test(key.trim())) {
                    throw new Error(`${logPrefix} targetWorkspaces[${i}].apiKeys[${k}] must be a valid Postman API key.`);
                }
            }

            const collectionUidRegex = /^[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (workspace.collectionUid !== undefined) {
                if (typeof workspace.collectionUid !== "string" || !collectionUidRegex.test(workspace.collectionUid.trim())) {
                    throw new Error(`${logPrefix} targetWorkspaces[${i}].collectionUid must match expected format (8-8-4-4-4-12).`);
                }
            }

            if (!workspace.collectionUid && workspace.preventAutoCreate) {
                throw new Error(`${logPrefix} Either 'collectionUid' must be defined or 'preventAutoCreate' must be disabled for workspace '${workspace.id}'.`);
            }

            if (workspace.syncSchedule !== undefined) {
                if (!Array.isArray(workspace.syncSchedule)) {
                    throw new Error(`${logPrefix} targetWorkspaces[${i}].syncSchedule must be an array if provided.`);
                }

                for (const [j, slot] of workspace.syncSchedule.entries()) {
                    if (
                        typeof slot.startHour !== "number" ||
                        typeof slot.endHour !== "number" ||
                        typeof slot.intervalMinutes !== "number"
                    ) {
                        throw new Error(`${logPrefix} targetWorkspaces[${i}].syncSchedule[${j}] must have numeric startHour, endHour, and intervalMinutes.`);
                    }

                    if (slot.startHour < 0 || slot.startHour > 23) {
                        throw new Error(`${logPrefix} .startHour must be between 0 and 23.`);
                    }

                    if (slot.endHour < 0 || slot.endHour > 23) {
                        throw new Error(`${logPrefix} .endHour must be between 0 and 23.`);
                    }

                    if (slot.startHour === slot.endHour) {
                        throw new Error(`${logPrefix} startHour and endHour cannot be equal.`);
                    }

                    if (slot.intervalMinutes < 0.5) {
                        throw new Error(`${logPrefix} .intervalMinutes must be at least 0.5 (30 seconds).`);
                    }
                }
            }

            if (workspace.tag !== undefined && (typeof workspace.tag !== "string" || workspace.tag.trim() === "")) {
                throw new Error(`${logPrefix} targetWorkspaces[${i}].tag must be a non-empty string if provided.`);
            }

            if (workspace.enabled !== undefined && typeof workspace.enabled !== "boolean") {
                throw new Error(`${logPrefix} targetWorkspaces[${i}].enabled must be a boolean if provided.`);
            }
        }

        if (options.minIntervalMs !== undefined && options.minIntervalMs < 3000) {
            throw new Error(`${logPrefix} 'minIntervalMs' must be at least 3000ms (3 seconds).`);
        }

        if (options.logger !== undefined) {
            const requiredMethods = ["info", "warn", "error"];
            for (const method of requiredMethods) {
                if (typeof (options.logger as any)?.[method] !== "function") {
                    throw new Error(`${logPrefix} custom logger must implement .${method}()`);
                }
            }
        }

        if (options.dryRun !== undefined && typeof options.dryRun !== "boolean") {
            throw new Error(`${logPrefix} 'dryRun' must be a boolean if provided.`);
        }

        if (options.storageDir !== undefined && typeof options.storageDir !== "string") {
            throw new Error(`${logPrefix} 'storageDir' must be a string if provided.`);
        }
        if (options.enableJsonDiff !== undefined && typeof options.enableJsonDiff !== "boolean") {
            throw new Error(`${logPrefix} 'enableJsonDiff' must be a boolean if provided.`);
        }
    }


    public start() {
        if (this.running) return;
        this.running = true;
        this.logger.info("PostmanSync started");
        this.syncLoop();
    }

    public stop() {
        this.running = false;
        this.logger.info("PostmanSync stopped");
    }

    private async syncLoop() {
        if (!this.running) return;

        const interval = this.getCurrentInterval();

        if (this.isSyncing) {
            this.logger.warn("Sync already in progress, skipping this loop");
            return setTimeout(() => this.syncLoop(), interval);
        }

        this.isSyncing = true;
        try {
            await this.sync();
        } catch (err) {
            this.logger.error("Sync failed", err);
            this.emit("error", err, "syncLoop");
        }
        this.isSyncing = false;

        setTimeout(() => this.syncLoop(), interval);
    }

    private getCurrentInterval(): number {
        return this.options.minIntervalMs ?? 3000;
    }

    private shouldSyncTarget(target: WorkspaceConfig): boolean {
        const now = Date.now();
        const last = this.lastSyncTimes.get(target.id) ?? 0;

        const schedule = target.syncSchedule ?? this.scheduleConfig;
        const block = schedule?.find(slot => {
            const hour = new Date().getHours();

            if (slot.startHour <= slot.endHour) {
                return hour >= slot.startHour && hour < slot.endHour;
            }

            return hour >= slot.startHour || hour < slot.endHour;
        });

        const intervalMs = (block?.intervalMinutes ?? 10) * 60_000;
        return now - last >= intervalMs;
    }

    private async fetchCollection(): Promise<any> {
        if (this.options.readOnlyUrl) {
            this.logger.info("Fetching collection via read-only public URL...");
            const res = await axios.get(this.options.readOnlyUrl);

            if (!res.data || !res.data.collection) {
                throw new Error("Invalid response from read-only URL — collection missing");
            }

            return res.data.collection;
        }

        throw new Error("readOnlyUrl is required. collectionId-based fetch is deprecated.");
    }

    private isTargetWithinSchedule(target: WorkspaceConfig): boolean {
        const hasLocal = target.syncSchedule && target.syncSchedule.length > 0;
        const hasGlobal = this.scheduleConfig && this.scheduleConfig.length > 0;

        const scheduleToUse = hasLocal
            ? target.syncSchedule!
            : hasGlobal
                ? this.scheduleConfig!
                : null;

        if (hasLocal && hasGlobal) {
            this.emit("scheduleOverride", {
                targetId: target.id,
                tag: target.tag,
                overriddenBy: "target",
                targetSchedule: target.syncSchedule!,
                globalSchedule: this.scheduleConfig!,
            });
        }

        if (!scheduleToUse) return true;

        const currentHour = new Date().getHours();
        return scheduleToUse.some(slot => {
            if (slot.startHour <= slot.endHour) {
                return currentHour >= slot.startHour && currentHour < slot.endHour;
            } else {
                return currentHour >= slot.startHour || currentHour < slot.endHour;
            }
        });
    }

    private async sync() {
        this.logger.info("Running sync cycle...");
        this.emit("syncStart");

        let collection;
        try {
            collection = await this.fetchCollection();
        } catch (err) {
            this.logger.error("Failed to fetch collection", err);
            this.emit("error", err, "fetchCollection");
            return;
        }
        const {changed, diff} = this.watcher.detectChange(collection);

        if (!changed) {
            this.logger.info("No change detected in collection.");
            this.emit("noChange");
            return;
        }

        this.logger.info("Collection changed.");
        this.emit("change", collection, diff);

        if (this.dryRun) return;

        for (const target of this.targetWorkspacesMap.values()) {
            const tagLabel = target.tag ? `(${target.tag})` : "";

            if (target.enabled === false) {
                this.logger.info(`Skipping disabled target ${target.id} ${tagLabel}`);
                continue;
            }

            if (!this.isTargetWithinSchedule(target)) {
                this.logger.info(`Target ${target.id} ${tagLabel} is outside its sync schedule`);
                continue;
            }

            if (!this.shouldSyncTarget(target)) {
                this.logger.info(`Target ${target.id} ${tagLabel} skipped due to sync interval`);
                continue;
            }
            this.lastSyncTimes.set(target.id, Date.now());

            const targetLimiter = new RateLimiter(target.apiKeys);

            try {
                const result = await targetLimiter.withRetry(async (apiKey) => {
                    const client = new PostmanApiClient(apiKey);
                    return await client.upsertCollection(target.id, collection, target.collectionUid, target.preventAutoCreate);
                });

                if (result.action === "insert" && result.response.status === HttpStatusCode.Ok) {
                    target.collectionUid = result.response.data.collection.uid;
                    this.appendAutoCreatedLogLine(target.id,target.collectionUid!)
                    this.targetWorkspacesMap.set(target.id, target);

                }

                this.logger.info(`Synced to target ${target.id} ${tagLabel}: ${result.action}`);
                this.emit(result.action, target.id, collection);
            } catch (err) {
                this.logger.error(`Failed to sync to target ${target.id} ${tagLabel}`, err);
                this.emit("error", err, `syncTarget:${target.id}`);
            }
        }

        this.logger.info("Sync to all targets completed.");
        this.emit("syncComplete");
    }

    private extractCollectionId(readOnlyUrl: string) {
        const urlObj = new URL(readOnlyUrl);
        const collectionId = urlObj.pathname.split('/').pop()
        if (!collectionId) {
            throw new Error("No collection id found.");
        }
        return collectionId
    }

    private appendAutoCreatedLogLine(workspaceId:string,createdCollectionUid: string) {
        const logPath = path.join(this.watcher.storageDir, "auto_created.log");
        const timestamp = new Date().toISOString();

        const line = `[${timestamp}] Auto-created collection for workspaceId=${workspaceId}, mainCollectionId=${this.watcher.mainCollectionUid}, readonlyUrl=${this.options.readOnlyUrl} → createdCollectionUid=${createdCollectionUid}\n`;

        fs.appendFileSync(logPath, line, "utf-8");
    }
}
