import pino from "pino";
import {Logger, LogLevel} from "./types";


export function createLogger(customLogger?: Logger, logLevel: LogLevel = "info"): Logger {
  if (customLogger) {
    if ((customLogger as any).level && typeof (customLogger as any).level === "string") {
      try {
        (customLogger as any).level = logLevel;
      } catch {}
    }
    return customLogger;
  }

  const levelMap: Record<LogLevel, string> = {
    silent: "fatal",
    error: "error",
    warn: "warn",
    info: "info",
    debug: "debug",
  };

  const logger = pino({
    level: levelMap[logLevel] || "info",
    transport: {
      target: "pino-pretty",
    },
  });

  const noop = () => {};

  const isSilent = logLevel === "silent";

  return {
    info: isSilent ? noop : logger.info.bind(logger),
    warn: isSilent ? noop : logger.warn.bind(logger),
    error: isSilent ? noop : logger.error.bind(logger),
    debug: isSilent ? noop : logger.debug?.bind(logger),
  };
}
