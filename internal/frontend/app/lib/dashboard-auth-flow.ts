export type DashboardAuthResolution<T> =
  | { type: "authenticated"; user: T }
  | { type: "setup-required" }
  | { type: "unauthenticated" };

export async function resolveDashboardAuth<T>(options: {
  cachedUser: T | null;
  getCurrentUser: () => Promise<T>;
  getBootstrapStatus: () => Promise<{ setupRequired: boolean }>;
  isUnauthorized: (error: unknown) => boolean;
}): Promise<DashboardAuthResolution<T>> {
  if (options.cachedUser) {
    return { type: "authenticated", user: options.cachedUser };
  }

  try {
    return { type: "authenticated", user: await options.getCurrentUser() };
  } catch (error) {
    if (!options.isUnauthorized(error)) {
      throw error;
    }
  }

  const bootstrapStatus = await options.getBootstrapStatus();
  return bootstrapStatus.setupRequired
    ? { type: "setup-required" }
    : { type: "unauthenticated" };
}
