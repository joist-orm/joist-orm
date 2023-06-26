import fsCache from "file-system-cache";
import {hashString} from "./utils";

type HashPair = { sourceHash: string, commentStoreHash: string | undefined };

export class Cache {
    private fsCache = fsCache({
        ns: "joist-doc",
    });

    private manifest: Record<string, [string, string | undefined]>

    constructor() {
        try {
            this.manifest = JSON.parse(this.fsCache.getSync('manifest'))
        } catch {
            this.manifest = {};
        }

        console.log(this.manifest);
    }

    save() {
        this.fsCache.setSync('manifest', JSON.stringify(this.manifest));
    }

    async set(filePath:string, {sourceHash, commentStoreHash}: HashPair, generated: string) {
        this.manifest[filePath] = [sourceHash, commentStoreHash];
        await this.fsCache.set(hashString(filePath), generated);
    }

    async get(filePath:string, hashes: HashPair) {
        const found = this.manifest[filePath];
        if (found[0] === hashes.sourceHash && found[1] === hashes.commentStoreHash) {
            const restored = await this.fsCache.get(hashString(filePath));
            console.log('found', !!restored)

            if (restored) return restored;
        }

        return undefined;
    }
}