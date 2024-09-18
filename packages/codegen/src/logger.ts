export const LOG_LEVELS = {
  warn: 4,
  error: 5,
}

export let loggerMaxWarningLevelHit = 0;

export const logger = {
  warn(...args: Parameters<typeof console["warn"]>) {
    loggerMaxWarningLevelHit = Math.max(loggerMaxWarningLevelHit, LOG_LEVELS.warn);
    console.warn("WARNING:", ...args);
  },
  error(...args: Parameters<typeof console["warn"]>) {
    loggerMaxWarningLevelHit = Math.max(loggerMaxWarningLevelHit, LOG_LEVELS.error);
    console.warn("ERROR:", ...args);
  }
}