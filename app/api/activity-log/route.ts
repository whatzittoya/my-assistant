import { recentLogs, subscribe, type LogEntry } from "@/lib/activity-log";

export const runtime = "nodejs";

function encode(entry: LogEntry): string {
  return `data: ${JSON.stringify(entry)}\n\n`;
}

export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      // Replay recent entries so client catches up
      for (const entry of recentLogs(50)) {
        controller.enqueue(encode(entry));
      }

      const unsub = subscribe((entry) => {
        try {
          controller.enqueue(encode(entry));
        } catch {
          // Client disconnected
        }
      });

      // Ping every 25s to keep connection alive
      const ping = setInterval(() => {
        try {
          controller.enqueue(": ping\n\n");
        } catch {
          clearInterval(ping);
        }
      }, 25_000);

      // Cleanup on stream cancel (client disconnect)
      return () => {
        unsub();
        clearInterval(ping);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
