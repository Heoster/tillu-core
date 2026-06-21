import path from "path";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import { config } from "./config";
import { logger } from "./utils/logger";
import { 
  requestIdMiddleware, 
  requestLoggingMiddleware, 
  errorHandlerMiddleware, 
  notFoundHandler,
  asyncHandler 
} from "./middleware/errorHandler";
import { 
  rateLimitMiddleware, 
  securityHeadersMiddleware, 
  apiKeyAuthMiddleware,
  requestSizeMiddleware,
  ipFilterMiddleware,
  requestTimeoutMiddleware
} from "./middleware/security";
import { incrementHttpRequest } from "./routes/metrics";
import { startDreamLoop } from "./engines/dream-loop";
import { startTilluAlive } from "./engines/tillu-alive";
import { loadSkills } from "./engines/skill-engine";
import { handleSenseConnection } from "./ws/sense-handler";
import { handleHandsConnection } from "./ws/hands-handler";
import { handleUIConnection } from "./ws/ui-handler";
import { pingHandler } from "./routes/ping";
import { healthHandler } from "./routes/health";
import { metricsHandler, prometheusMetricsHandler } from "./routes/metrics";
import { messageHandler } from "./routes/message";
import { presenceHandler } from "./routes/presence";
import { briefingHandler } from "./routes/briefing";
import { dreamStatusHandler } from "./routes/dream";
import { skillsListHandler, skillsRunHandler, skillsCreateHandler } from "./routes/skills";

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();

// Trust proxy for correct IP addresses behind load balancers
if (config.server.trustProxy) {
  app.set("trust proxy", true);
}

// Body parsing with size limit
app.use(express.json({ limit: `${config.server.maxPayloadSize}b` }));
app.use(express.urlencoded({ extended: true, limit: `${config.server.maxPayloadSize}b` }));

// CORS configuration
if (config.security.enableCors) {
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", config.server.corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID");
    if (req.method === "OPTIONS") { 
      res.status(204).end(); 
      return; 
    }
    next();
  });
}

// Request middleware
app.use(requestIdMiddleware);

// Security middleware
app.use(securityHeadersMiddleware);
app.use(requestSizeMiddleware);
app.use(rateLimitMiddleware);
app.use(ipFilterMiddleware);
app.use(requestTimeoutMiddleware(config.services.serviceTimeout));

// Optional API key authentication (if configured)
if (config.security.apiKey) {
  app.use(apiKeyAuthMiddleware);
}

// Request logging (must come after security middleware)
if (config.security.enableRequestLogging) {
  app.use(requestLoggingMiddleware);
}

// ─── REST routes ──────────────────────────────────────────────────────────────

app.get("/ping",                    asyncHandler(pingHandler));
app.get("/health",                  asyncHandler(healthHandler));

// Metrics endpoints (conditional)
if (config.monitoring.enableMetrics) {
  app.get(config.monitoring.metricsPath,           asyncHandler(metricsHandler));
  app.get("/metrics/prometheus",                   asyncHandler(prometheusMetricsHandler));
}

app.get("/presence",                asyncHandler(presenceHandler));
app.get("/briefing",                asyncHandler(briefingHandler));
app.get("/dream/status",            asyncHandler(dreamStatusHandler));
app.post("/message",                asyncHandler(messageHandler));
app.get("/skills",                  asyncHandler(skillsListHandler));
app.post("/skills/run",             asyncHandler(skillsRunHandler));
app.post("/skills/create",          asyncHandler(skillsCreateHandler));

// Root
app.get("/", asyncHandler(async (req, res) => {
  const endpoints = [
    "/ping",
    "/health",
    "/presence", 
    "/briefing",
    "/dream/status",
    "/message",
    "/skills",
    "/skills/run",
    "/skills/create",
  ];
  
  if (config.monitoring.enableMetrics) {
    endpoints.push(config.monitoring.metricsPath, "/metrics/prometheus");
  }
  
  res.json({
    service: "tillu-core",
    version: "1.0.0",
    description: "The persistent brain of TILLU AI",
    environment: config.env,
    endpoints,
    websockets: ["/sense", "/hands", "/ui"],
  });
}));

// ─── Error handling ──────────────────────────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandlerMiddleware);

// ─── HTTP + WebSocket server ──────────────────────────────────────────────────

const server = http.createServer(app);

const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket, req) => {
  const path = req.url ?? "/";

  if (path.startsWith("/sense")) {
    handleSenseConnection(ws);
  } else if (path.startsWith("/hands")) {
    handleHandsConnection(ws);
  } else if (path.startsWith("/ui")) {
    handleUIConnection(ws);
  } else {
    console.warn(`[WS] Unknown path: ${path} — closing`);
    ws.close(1008, "Unknown WebSocket path");
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = config.server.port;

server.listen(PORT, () => {
  logger.info(`🧠 Tillu-Core starting`, {
    port: PORT,
    environment: config.env,
    host: config.server.host,
  });

  logger.info(`🌐 Server ready`, {
    rest: `http://localhost:${PORT}`,
    websocket: `ws://localhost:${PORT}/sense | /hands | /ui`,
  });

  // Load skills from tillu-skills/ directory (sibling of tillu-core/)
  const skillsDir = path.resolve(__dirname, "../../tillu-skills");
  try {
    loadSkills(skillsDir);
    logger.info(`📚 Skills loaded`, { directory: skillsDir });
  } catch (error) {
    logger.error(`Failed to load skills`, { directory: skillsDir }, error as Error);
  }

  // Start Dream Loop scheduler
  if (config.dreamLoop.enabled) {
    try {
      startDreamLoop();
      logger.info(`💤 Dream Loop started — Tillu is always thinking`, {
        interval: `${config.dreamLoop.intervalHours}h`,
        morningBriefing: config.dreamLoop.morningBriefingTime,
      });
    } catch (error) {
      logger.error(`Failed to start Dream Loop`, {}, error as Error);
    }
  } else {
    logger.info(`💤 Dream Loop disabled`);
  }

  // Start Tillu Alive heartbeat engine
  try {
    startTilluAlive();
    logger.info(`💓 Tillu Alive — heartbeat running`);
  } catch (error) {
    logger.error(`Failed to start Tillu Alive`, {}, error as Error);
  }

  logger.info(`✅ Tillu-Core fully operational`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info(`[Core] SIGTERM received — shutting down gracefully`);
  server.close(() => {
    logger.info(`[Core] Server closed`);
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info(`[Core] SIGINT received — shutting down gracefully`);
  server.close(() => {
    logger.info(`[Core] Server closed`);
    process.exit(0);
  });
});

process.on("uncaughtException", (err) => {
  console.error("[Core] Uncaught exception:", err);
  // Allow logs to flush, then exit — the process is in an undefined state
  server.close(() => process.exit(1));
  setTimeout(() => process.exit(1), 3000);
});

process.on("unhandledRejection", (reason) => {
  logger.error(`[Core] Unhandled rejection`, { reason });
});
