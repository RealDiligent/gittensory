import { getGithubUserCreatedAt } from "../github/app";

/** Fail-open account-age check shared by issue cap tightening and issue-open labeling (#2561). */
export async function isBelowAccountAgeThreshold(
  env: Env,
  installationId: number,
  authorLogin: string,
  accountAgeThresholdDays: number | null | undefined,
): Promise<boolean> {
  if (typeof accountAgeThresholdDays !== "number") return false;
  const createdAt = await getGithubUserCreatedAt(env, installationId, authorLogin);
  if (!createdAt) return false;
  const ageDays = (Date.now() - Date.parse(createdAt)) / (24 * 60 * 60 * 1000);
  return ageDays < accountAgeThresholdDays;
}

export function repoOwnerLoginFromFullName(fullName: string): string {
  const slashIdx = fullName.indexOf("/");
  if (slashIdx === -1) return "";
  return fullName.slice(0, slashIdx);
}

export function effectiveIssueCapForAccountAge(cap: number, isNewAccount: boolean): number {
  if (isNewAccount) return Math.max(1, Math.ceil(cap / 2));
  return cap;
}
