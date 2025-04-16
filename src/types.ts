export type Logger = {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
    debug?: (...args: any[]) => void;
};

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

export interface PostmanCollection {
    info: { _postman_id: string; name: string; };
    item: any[];
}

export type SyncSchedule = {
    startHour: number;
    endHour: number;
    intervalMinutes: number;
};

export type ApiUsageEstimate = {
    estimatedDailyCalls: number;
    estimatedMonthlyCalls: number;
    recommendedPlan: "Free" | "Basic" | "Pro" | "Enterprise";
};

export interface PostmanSyncOptions {
    readOnlyUrl: string;
    targetWorkspaces: WorkspaceConfig[];
    logger?: Logger;
    dryRun?: boolean;
    syncSchedule?: SyncSchedule[];
    minIntervalMs?: number;
    storageDir?:string
    enableJsonDiff?:boolean
    logLevel?: LogLevel; // Optional, default: "info"
}

export interface CollectionWatcherOptions {
    storageDir?: string;
    enableJsonDiff?: boolean;
    mainCollectionUId:string
}

export interface WorkspaceConfig {
    id: string;
    apiKeys: string[];
    collectionUid?: string;
    tag?: string;
    enabled?: boolean;
    syncSchedule?: SyncSchedule[];
    preventAutoCreate?: boolean;
}

export interface PostmanSyncEvents {
    syncStart: void;
    syncComplete: void;
    change: [collection: any, diff: any];
    noChange: void;
    error: [error: any, context: string];
    update: [targetId: string, collection: any];
    insert: [targetId: string, collection: any];
    scheduleOverride: {
        targetId: string;
        tag?: string;
        overriddenBy: "target";
        targetSchedule: SyncSchedule[];
        globalSchedule: SyncSchedule[];
    };
}
