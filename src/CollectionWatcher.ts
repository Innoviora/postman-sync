import crypto from "crypto";
import * as jsonpatch from "fast-json-patch";
import {CollectionWatcherOptions} from "./types";
import * as fs from "node:fs";
import path from "node:path";

export class CollectionWatcher {
    private lastHash: string | null = null;
    public storageDir: string = 'postman-sync-storage'
    private filePath!: string;
    private enableJsonDiff = false;
    public mainCollectionUid!: string;

    constructor(private collectionWatcherOptions: CollectionWatcherOptions) {
        if (collectionWatcherOptions.storageDir) this.storageDir = collectionWatcherOptions.storageDir
        if (collectionWatcherOptions.enableJsonDiff) this.enableJsonDiff = collectionWatcherOptions.enableJsonDiff
        this.mainCollectionUid = collectionWatcherOptions.mainCollectionUId
    }

    public loadPreviousState() {
        if (!this.enableJsonDiff) return;
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, {recursive: true});
        }

        this.filePath = path.join(this.storageDir, `collection_${this.collectionWatcherOptions.mainCollectionUId}.json`);

        if (fs.existsSync(this.filePath)) {
            const fileData = fs.readFileSync(this.filePath, "utf-8");
            this.lastHash = this.hash(JSON.parse(fileData));
        }
    }

    private readStoredCollectionJson() {
        this.filePath = path.join(this.storageDir, `collection_${this.collectionWatcherOptions.mainCollectionUId}.json`);

        if (fs.existsSync(this.filePath)) {
            const fileData = fs.readFileSync(this.filePath, "utf-8");
            return JSON.parse(fileData);
        }
        return null;
    }

    private hash(data: any): string {
        return crypto.createHash("sha256")
            .update(JSON.stringify(data))
            .digest("hex");
    }

    public detectChange(newCollection: any): { changed: boolean; diff?: any[] } {
        const newItem = newCollection.item || newCollection;
        const currentHash = this.hash(newItem);
        const changed = this.lastHash !== currentHash;

        let diff = undefined;

        if (changed && this.enableJsonDiff) {
            const lastCollection = this.readStoredCollectionJson()
            if (lastCollection) {
                diff = jsonpatch.compare(lastCollection, newItem);
            }
            this.writeStoredCollectionJson(newItem);
        }

        this.lastHash = currentHash;

        return {changed, diff};
    }

    private writeStoredCollectionJson(collection: any) {
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }

        fs.writeFileSync(this.filePath, JSON.stringify(collection, null, 2), "utf-8");
    }

}
