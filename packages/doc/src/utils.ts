import { CommentBlock } from "@babel/types";
import { createHash } from "crypto";
import { readFile } from "fs/promises";

/**
 * Builds a CommentBlock node with correct TSDoc formatting
 * across new files
 */
export function newComment(comment: string): CommentBlock {
  const lines = comment.trim().split("\n");

  return {
    type: "CommentBlock",
    value: lines.length > 1 ? `*\n${lines.map((c) => `* ${c}`).join("\n")}\n` : `* ${lines[0]} `,
  };
}

export function hashString(content: string) {
  const sum = createHash("sha1");
  sum.update(content);
  return sum.digest("hex");
}

export async function hashFile(path: string) {
  return hashString(await readFile(path, { encoding: "utf-8" }).catch(() => "na"));
}
