export interface ClusterConnection {
  host: string;
  port: number;
  user: string;
  password: string;
}

export const ROOT: string;
export const MIGRATIONS_DIR: string;
export const SEED_FILE: string;
export const SEED_DIR: string;
export const SHIM_FILE: string;

export function startCluster(options: {
  name: string;
  port: number;
}): Promise<{ conn: ClusterConnection; stop: () => Promise<void> }>;
export function seedFiles(): string[];
export function migrationFiles(): string[];
export function createDatabase(
  conn: ClusterConnection,
  database: string,
  options?: { seed?: boolean },
): Promise<string>;
