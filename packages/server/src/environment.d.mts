export type Environment = Record<string, string | undefined>;
export const settingNames: string[];
export function settingsFromEnvironment(environment: Environment): Record<string, string>;
export function validateSettings(settings: Environment): Environment;
export function environmentFor(app: string, settings: Environment, inherited?: Environment): Record<string, string>;
