import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac } from "node:crypto";
import process from "node:process";
import { processCaptureJob } from "./capture.js";
import type { WorkerCaptureRequest } from "./types.js";

const PORT = process.env.PORT || 3001;
const WORKER_SECRET = process.env.WORKER_SECRET;

if (!WORKER_SECRET) {
  console.warn("WARNING: WORKER_SECRET is not set. Requests will fail signature validation.");
}

function verifyHmac(payload: string, signature: string | undefined): boolean {
  const secret = process.env.WORKER_SECRET;
  if (!secret || !signature) return false;
  try {
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    return expected === signature;
  } catch {
    return false;
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.method === "POST" && req.url === "/capture") {
    const signature = req.headers["x-worker-signature"] as string | undefined;
    
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      if (!verifyHmac(body, signature)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized: invalid signature" }));
        return;
      }

      try {
        const payload = JSON.parse(body) as WorkerCaptureRequest;
        
        if (!payload.auditRunId || !payload.domain) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing required fields" }));
          return;
        }

        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing DATABASE_URL" }));
          return;
        }

        const result = await processCaptureJob(databaseUrl, payload);
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error("Worker error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

export const server = createServer(handleRequest);

// Only start the server if run directly (not imported in tests)
if (process.argv[1] === import.meta.filename) {
  server.listen(PORT, () => {
    console.log(`[worker] Server listening on port ${PORT}`);
  });
}
