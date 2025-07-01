export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export class Logger {
  private static logLevel: LogLevel = Logger.parseLogLevel(process.env.LOG_LEVEL || 'info');

  private static parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'error': return LogLevel.ERROR;
      case 'warn': return LogLevel.WARN;
      case 'info': return LogLevel.INFO;
      case 'debug': return LogLevel.DEBUG;
      default: return LogLevel.INFO;
    }
  }

  private static log(level: LogLevel, message: string, ...args: any[]): void {
    if (level <= Logger.logLevel) {
      const timestamp = new Date().toISOString();
      const levelName = LogLevel[level];
      console.log(`[${timestamp}] ${levelName}: ${message}`, ...args);
    }
  }

  public static error(message: string, ...args: any[]): void {
    Logger.log(LogLevel.ERROR, message, ...args);
  }

  public static warn(message: string, ...args: any[]): void {
    Logger.log(LogLevel.WARN, message, ...args);
  }

  public static info(message: string, ...args: any[]): void {
    Logger.log(LogLevel.INFO, message, ...args);
  }

  public static debug(message: string, ...args: any[]): void {
    Logger.log(LogLevel.DEBUG, message, ...args);
  }

  public static setLogLevel(level: LogLevel): void {
    Logger.logLevel = level;
  }

  public static getLogLevel(): LogLevel {
    return Logger.logLevel;
  }
}