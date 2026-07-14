import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import createCryptoPayment from "../api/create-crypto-payment.js";
import contact from "../api/contact.js";
import nowpaymentsWebhook from "../api/nowpayments-webhook.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ApiHandler = (req: express.Request, res: express.Response) => Promise<unknown>;

// Express 4 does not forward rejected promises automatically. Keep one adapter
// so the standalone server uses the exact same hardened handlers as Vercel.
function route(handler: ApiHandler): express.RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Register the webhook before any body parser. Its handler reads and caps the
  // raw request stream so NOWPayments HMAC verification sees the original bytes.
  app.post("/api/nowpayments-webhook", route(nowpaymentsWebhook));

  app.use(express.json({ limit: "1mb" }));
  app.post("/api/create-crypto-payment", route(createCryptoPayment));
  app.post("/api/contact", route(contact));

  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled server error:", err);
    if (res.headersSent) return;
    const status = err?.type === "entity.too.large" ? 413 : err?.status === 400 ? 400 : 500;
    res.status(status).json({ error: status === 413 ? "Payload too large" : status === 400 ? "Invalid request" : "Internal server error" });
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => console.log(`Server running on http://localhost:${port}/`));
}

startServer().catch(console.error);
