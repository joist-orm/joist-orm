import fs from "fs";

const ALLOWED_FILES = [".DS_Store", ".git", ".gitattributes", ".gitignore", "Thumbs.db"];

export function isFolderEmpty(dirPath: string): boolean {
  const files = fs.readdirSync(dirPath);
  const relevantFiles = files.filter((file) => !ALLOWED_FILES.includes(file));
  return relevantFiles.length === 0;
}
