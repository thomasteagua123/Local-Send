import httpBridge from "react-native-http-bridge-refurbished";

let isServerRunning = false;
let onConnectionCallback: ((senderAlias: string) => void) | null = null;

export function setConnectionHandler(handler: (deviceName: string) => void) {
  onConnectionCallback = handler;
}

export function startLocalServer(port: number = 53317) {
  if (isServerRunning) return;

  httpBridge.start(port, "http_service", (request) => {
    const { requestId, postData, type, url } = request;

    // GET /api/localsend/v2/info
    if (url.includes("/api/localsend/v2/info") && type === "GET") {
      httpBridge.respond(
        requestId,
        200,
        "application/json",
        JSON.stringify({
          alias: "Celular React Native",
          version: "2.0",
          deviceModel: "Mobile",
          deviceType: "mobile",
        })
      );
    }
    // POST /api/localsend/v2/prepare-upload
    else if (url.includes("/api/localsend/v2/prepare-upload") && type === "POST") {
      try {
        const body = postData ? JSON.parse(postData) : {};
        const senderAlias = body?.info?.alias || "Dispositivo Remoto";

        if (onConnectionCallback) {
          onConnectionCallback(senderAlias);
        }

        const sessionId = `session-${Date.now()}`;
        const responseFiles: Record<string, string> = {};

        if (body?.files) {
          Object.keys(body.files).forEach((fileId) => {
            responseFiles[fileId] = `token-${Date.now()}`;
          });
        }

        httpBridge.respond(
          requestId,
          200,
          "application/json",
          JSON.stringify({ sessionId, files: responseFiles })
        );
      } catch (e) {
        httpBridge.respond(requestId, 400, "application/json", JSON.stringify({ error: "Invalid JSON" }));
      }
    }
    // POST /api/localsend/v2/upload
    else if (url.includes("/api/localsend/v2/upload") && type === "POST") {
      httpBridge.respond(
        requestId,
        200,
        "application/json",
        JSON.stringify({ ok: true })
      );
    }
    // Default 404
    else {
      httpBridge.respond(requestId, 404, "text/plain", "Not Found");
    }
  });

  isServerRunning = true;
  console.log(`[ServerService] Servidor HTTP escuchando en puerto ${port}`);
}

export function stopLocalServer() {
  if (isServerRunning) {
    httpBridge.stop();
    isServerRunning = false;
    console.log("[ServerService] Servidor HTTP detenido.");
  }
}