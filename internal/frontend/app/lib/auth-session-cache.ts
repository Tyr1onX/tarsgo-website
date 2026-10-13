export const ANONYMOUS_SESSION_CACHE_TTL_MS = 5_000;

type AuthSessionState<T> =
  | { type: "unknown" }
  | { type: "anonymous"; expiresAt: number }
  | { type: "authenticated"; user: T };

/** Keeps only the current in-memory auth result and rejects responses from older sessions. */
export class AuthSessionCache<T> {
  private state: AuthSessionState<T> = { type: "unknown" };
  private generation = 0;

  get version() {
    return this.generation;
  }

  getUser(): T | null {
    return this.state.type === "authenticated" ? this.state.user : null;
  }

  hasFreshAnonymousResult(now = Date.now()): boolean {
    return this.state.type === "anonymous" && this.state.expiresAt > now;
  }

  setAuthenticated(user: T) {
    this.generation += 1;
    this.state = { type: "authenticated", user };
  }

  setAnonymous(now = Date.now()) {
    this.generation += 1;
    this.state = { type: "anonymous", expiresAt: now + ANONYMOUS_SESSION_CACHE_TTL_MS };
  }

  acceptAuthenticatedRequest(version: number, user: T): boolean {
    if (version !== this.generation) return false;
    this.state = { type: "authenticated", user };
    return true;
  }

  acceptAnonymousRequest(version: number, now = Date.now()): boolean {
    if (version !== this.generation) return false;
    this.state = { type: "anonymous", expiresAt: now + ANONYMOUS_SESSION_CACHE_TTL_MS };
    return true;
  }

  acceptFailedRequest(version: number): boolean {
    if (version !== this.generation) return false;
    this.generation += 1;
    this.state = { type: "unknown" };
    return true;
  }
}
