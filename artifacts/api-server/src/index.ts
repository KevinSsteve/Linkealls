import http from "http";
import app from "./app.js";
import { setupCallFunnelWebSocket } from "./routes/callFunnelWs.js";
import { startDailySummaryCron } from "./services/notifications.js";
import { startCampaignSyncCron } from "./services/campaignAds.js";
import { wireProactiveEvents } from "./services/assistant.js";
import { logger } from "./lib/logger.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

setupCallFunnelWebSocket(server);

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});

server.listen(port, () => {
  logger.info({ port }, "Server listening");
  startDailySummaryCron();
  wireProactiveEvents();
  startCampaignSyncCron();
});
