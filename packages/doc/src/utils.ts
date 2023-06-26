import {CommentBlock} from "@babel/types";
import {createHash} from "crypto";
import {readFile} from "fs/promises";

/**
 * Builds a CommentBlock node with correct TSDoc formatting
 * across new files
 */
export function newComment(comment: string): CommentBlock {
    return {
        type: "CommentBlock",
        value: `*\n${comment.trim()
            .split("\n")
            .map((c) => `* ${c}`)
            .join("\n")}\n`,
    };
}


export function hashString(content: string) {
    const sum = createHash("sha1");
    sum.update(content);
    return sum.digest("hex");
}

export async function hashFile(path: string) {
    return hashString(await readFile(path, { encoding: 'utf-8'}).catch(() => 'na'))
}