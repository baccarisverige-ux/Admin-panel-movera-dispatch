import { AGENTS, type Agent } from "../auth/permissions.ts";
import { writeAgents, writeSession } from "../auth/sessionStore.ts";
import type { AdminApi } from "./create.ts";

/**
 * For tests of the fixture server: every command is sent by the agent it names, signed in first,
 * the way the app does it. `extraAgents` adds team members (for example one with a narrower scope).
 */
export function signedInFixture(api: AdminApi, extraAgents: readonly Agent[] = []): AdminApi {
  writeAgents([...AGENTS, ...extraAgents]);
  return {
    ...api,
    command(input) {
      writeSession(input.actorId ?? null);
      return api.command(input);
    },
  };
}
