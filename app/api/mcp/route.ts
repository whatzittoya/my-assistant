import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer } from "@/lib/mcp/server";

// MCP endpoint (Streamable HTTP, stateless). Auth is enforced by proxy.ts like
// every other /api/* route.

export const runtime = "nodejs";
export const maxDuration = 600; // longest wrapped action (collect_material, collect_course_diskusi)

async function handle(req: Request): Promise<Response> {
  const server = buildMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
