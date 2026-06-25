/**
 * Bearer/cookie auth bridge for the MCP endpoint.
 *
 * `withMcpAuth` calls this for every request; it reuses the app's single auth
 * entry point (`getSessionUser`, which resolves an `Authorization: Bearer tra_…`
 * token or the session cookie). Returning `undefined` makes the handler answer
 * 401, matching the rest of the API. The resolved user id is carried on
 * `clientId` so tool handlers can scope data to the caller via `extra.authInfo`.
 */

import { getSessionUser } from "../auth";

export async function verifyTranslatarrToken(_request: Request, bearerToken?: string) {
  const user = await getSessionUser();

  if (!user) {
    return undefined;
  }

  return {
    token: bearerToken ?? user.id,
    clientId: user.id,
    scopes: [] as string[],
    extra: { userId: user.id, role: user.role },
  };
}
