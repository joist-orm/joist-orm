import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Generic doc entry type that matches the structure of Astro content collections
 */
export type DocEntry = {
  id: string;
  data: {
    title: string;
    sidebar?: {
      order?: number;
    };
    [key: string]: any;
  };
  body?: string;
};

/**
 * Helper function to sort documentation by sidebar category and order
 *
 * @param docs Array of document collection entries
 * @param sidebarOrder Array of category names in the order they should appear
 * @returns Sorted array of document collection entries
 */
export function sortDocsByCategory<T extends DocEntry>(docs: T[], sidebarOrder: string[]): T[] {
  return [...docs].sort((a, b) => {
    // Extract the top-level category from the slug
    const aCategory = a.id.split("/")[0];
    const bCategory = b.id.split("/")[0];

    // Get the index of each category in the sidebarOrder array
    const aCategoryIndex = sidebarOrder.indexOf(aCategory);
    const bCategoryIndex = sidebarOrder.indexOf(bCategory);

    // First sort by category order
    if (aCategoryIndex !== bCategoryIndex) {
      return aCategoryIndex - bCategoryIndex;
    }

    // If same category, sort by sidebar property
    const aSidebar = a.data.sidebar?.order || 0;
    const bSidebar = b.data.sidebar?.order || 0;
    return aSidebar - bSidebar;
  });
}

/**
 * Extract sidebar order from an Astro config file
 * @param configPath Path to the astro.config.mjs file
 * @returns Array of sidebar category directories in order
 */
export async function getSidebarOrder(configPath: string): Promise<string[]> {
  try {
    // Read the file content
    const content = fs.readFileSync(configPath, "utf-8");

    // Find the sidebar configuration using regex
    const sidebarMatch = content.match(/sidebar:\s*\[([\s\S]*?)\]/);
    if (!sidebarMatch || !sidebarMatch[1]) {
      console.warn(`Could not find sidebar configuration in ${configPath}`);
      return [];
    }

    // Extract the directories from the sidebar entries
    const sidebarSection = sidebarMatch[1];
    // Look for patterns like: autogenerate: { directory: 'intro' }
    const directoryMatches = sidebarSection.matchAll(/directory:\s*['"]([^'"]+)['"]/g);

    // Convert iterator to array and extract directory names
    const sidebarOrder = Array.from(directoryMatches, (match) => match[1]);

    return sidebarOrder;
  } catch (error) {
    console.error(`Error parsing Astro config at ${configPath}:`, error);
    return [];
  }
}

/**
 * Helper function to get sidebar order for a specific project
 * @param importMetaUrl The import.meta.url of the calling file
 * @returns Array of sidebar category directories in order
 */
export async function getProjectSidebarOrder(importMetaUrl: string): Promise<string[]> {
  // Get the current file's directory
  const __filename = fileURLToPath(importMetaUrl);
  const __dirname = path.dirname(__filename);

  // Path to the astro config file (going up from src/pages to root)
  const configPath = path.resolve(__dirname, "../../astro.config.mjs");

  // Get and return sidebar order from config
  return getSidebarOrder(configPath);
}
