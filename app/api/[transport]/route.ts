/**
 * MCP (Model Context Protocol) endpoint over Streamable HTTP, served at
 * `/api/mcp` (the `[transport]` segment; static API routes like `/api/translate`
 * take precedence). `mcp-handler` builds the JSON-RPC handler; `withMcpAuth`
 * gates every call on the same auth as the REST API — connect with a personal
 * API key: `Authorization: Bearer tra_…`.
 *
 * Tools are registered in `app/lib/mcp/tools.ts` and call the same services the
 * REST routes use, so MCP and HTTP clients share one translation/chat code path.
 */

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyTranslatarrToken } from "../../lib/mcp/auth";
import { registerTranslatarrTools } from "../../lib/mcp/tools";
import { APP_VERSION } from "../../lib/version";

export const runtime = "nodejs";

const handler = createMcpHandler(
  registerTranslatarrTools,
  { serverInfo: { name: "translatarr", version: APP_VERSION } },
  { basePath: "/api", maxDuration: 120 },
);

const authHandler = withMcpAuth(handler, verifyTranslatarrToken, { required: true });

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
