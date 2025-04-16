import {PostmanSync} from "../src/PostmanSync";
import {PostmanSyncOptions} from "../src";

describe("PostmanSync - isTargetWithinSchedule logic", () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    const baseOptions: Partial<PostmanSyncOptions> = {
        logger: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        },
        dryRun: true,
    };

    it("should allow sync and emit override when both schedules exist and time is inside", () => {
        const date =  new Date()
        date.setHours(11)
        jest.setSystemTime(new Date(date.getTime())); // 11:00

        const overrideSpy = jest.fn();

        const options: PostmanSyncOptions = {
            ...baseOptions,
            readOnlyUrl: "https://mock.postman.com",
            syncSchedule: [{startHour: 9, endHour: 18, intervalMinutes: 10}],
            targetWorkspaces: [
                {
                    id: "qa",
                    tag: "qa-env",
                    apiKeys: ["key"],
                    syncSchedule: [{startHour: 10, endHour: 17, intervalMinutes: 15}],
                },
            ],
        };

        const sync = new PostmanSync(options);
        sync.on("scheduleOverride", overrideSpy);

        const result = (sync as any).isTargetWithinSchedule(options.targetWorkspaces[0]);
        expect(result).toBe(true);
        expect(overrideSpy).toHaveBeenCalledTimes(1);
    });

    it("should NOT allow sync when time is outside both schedules", () => {
        const date =  new Date()
        date.setHours(22)
        jest.setSystemTime(new Date(date.getTime())); // 22:00

        const overrideSpy = jest.fn();

        const options: PostmanSyncOptions = {
            ...baseOptions,
            readOnlyUrl: "https://mock.postman.com",
            syncSchedule: [{startHour: 9, endHour: 18, intervalMinutes: 10}],
            targetWorkspaces: [
                {
                    id: "qa",
                    tag: "qa-env",
                    apiKeys: ["key"],
                    syncSchedule: [{startHour: 10, endHour: 17, intervalMinutes: 15}],
                },
            ],
        };

        const sync = new PostmanSync(options);
        sync.on("scheduleOverride", overrideSpy);

        const result = (sync as any).isTargetWithinSchedule(options.targetWorkspaces[0]);
        expect(result).toBe(false);
        expect(overrideSpy).toHaveBeenCalledTimes(1);
    });

    it("should fallback to global schedule if target has no schedule", () => {
        const date =  new Date()
        date.setHours(11)
        jest.setSystemTime(new Date(date.getTime())); // 11:00

        const options: PostmanSyncOptions = {
            ...baseOptions,
            readOnlyUrl: "https://mock.postman.com",
            syncSchedule: [{startHour: 9, endHour: 18, intervalMinutes: 10}],
            targetWorkspaces: [
                {
                    id: "frontend",
                    tag: "fe",
                    apiKeys: ["key"],
                },
            ],
        };

        const sync = new PostmanSync(options);
        const result = (sync as any).isTargetWithinSchedule(options.targetWorkspaces[0]);
        expect(result).toBe(true);
    });

    it("should use only target schedule when global is missing", () => {
        const date =  new Date()
        date.setHours(11)
        jest.setSystemTime(new Date(date.getTime())); // 11:00

        const options: PostmanSyncOptions = {
            ...baseOptions,
            readOnlyUrl: "https://mock.postman.com",
            targetWorkspaces: [
                {
                    id: "backend",
                    tag: "be",
                    apiKeys: ["key"],
                    syncSchedule: [{startHour: 8, endHour: 12, intervalMinutes: 10}],
                },
            ],
        };

        const sync = new PostmanSync(options);
        const result = (sync as any).isTargetWithinSchedule(options.targetWorkspaces[0]);
        expect(result).toBe(true);
    });

    it("should allow sync always if no schedule exists", () => {
        const date =  new Date()
        date.setHours(3)
        jest.setSystemTime(new Date(date.getTime())); // 03:00

        const options: PostmanSyncOptions = {
            ...baseOptions,
            readOnlyUrl: "https://mock.postman.com",
            targetWorkspaces: [
                {
                    id: "staging",
                    apiKeys: ["key"],
                },
            ],
        };

        const sync = new PostmanSync(options);
        const result = (sync as any).isTargetWithinSchedule(options.targetWorkspaces[0]);
        expect(result).toBe(true);
    });

    it("should not run sync for disabled workspace", () => {
        const options: PostmanSyncOptions = {
            ...baseOptions,
            readOnlyUrl: "https://mock.postman.com",
            targetWorkspaces: [
                {
                    id: "disabled-ws",
                    apiKeys: ["key"],
                    enabled: false,
                },
            ],
        };

        const sync = new PostmanSync(options);
        const result = (sync as any).isTargetWithinSchedule(options.targetWorkspaces[0]);
        expect(result).toBe(true);
    });
});
