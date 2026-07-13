export declare const ALWAYS_FILE_CREDENTIAL_ENV_VARS: readonly string[];
export declare const PROVIDER_FILE_CREDENTIAL_ENV_VARS: Readonly<
  Record<string, readonly string[]>
>;

export function resolveFileCredentialEnvVarNames(
  env: Record<string, string | undefined>,
): readonly string[];

export function resolveFileCredential(
  env: Record<string, string | undefined>,
  name: string,
  readFile: (path: string) => string,
): "env" | "file" | "absent";

export function loadFileCredentials(
  env?: Record<string, string | undefined>,
  options?: { readFile?: (path: string) => string },
): void;
