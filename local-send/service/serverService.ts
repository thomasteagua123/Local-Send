import TcpSocket from "react-native-tcp-socket";
import { Buffer } from "buffer";
import * as FileSystem from "expo-file-system/legacy";

const PORT = 53317;

let server: ReturnType<typeof TcpSocket.createServer> | null = null;

let onConnectionRequest:
  | ((
      deviceName: string,
      acceptCallback: () => void,
      rejectCallback: () => void
    ) => void)
  | null = null;

let onFileReceived:
  | ((fileName: string, tempFilePath: string) => void)
  | null = null;

let onReceiveProgress:
  | ((fileName: string, percent: number) => void)
  | null = null;

export function setConnectionHandler(
  handler: (
    deviceName: string,
    acceptCallback: () => void,
    rejectCallback: () => void
  ) => void
) {
  onConnectionRequest = handler;
}

export function setFileReceivedHandler(
  handler: (fileName: string, tempFilePath: string) => void
) {
  onFileReceived = handler;
}

export function setReceiveProgressHandler(
  handler: ((fileName: string, percent: number) => void) | null
) {
  onReceiveProgress = handler;
}

function sendJson(socket: any, statusCode: number, data: object) {
  const body = JSON.stringify(data);

  const statusText =
    statusCode === 200 ? "OK" : statusCode === 403 ? "Forbidden" : "Error";

  const response =
    `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
    "Content-Type: application/json; charset=utf-8\r\n" +
    `Content-Length: ${Buffer.byteLength(body)}\r\n` +
    "Connection: close\r\n" +
    "\r\n" +
    body;

  try {
    socket.end(response);
  } catch (error) {
    console.error("Error enviando respuesta:", error);
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_");
}

export function startLocalServer() {
  if (server) {
    console.log("Servidor mobile ya iniciado");
    return;
  }

  server = TcpSocket.createServer((socket) => {
    console.log("Nueva conexión desde:", socket.remoteAddress);

    let headerBuffer = Buffer.alloc(0);
    let headersParsed = false;
    let handled = false;

    let method = "";
    let requestPath = "";
    let headers: Record<string, string> = {};
    let contentLength = 0;
    let incomingFileName = "";
    let lastReportedPercent = -1;

    const bodyChunks: Buffer[] = [];
    let bodyBytesReceived = 0;

    function toBuffer(chunk: any): Buffer {
      return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
    }

    function reportProgressIfNeeded() {
      if (
        method === "POST" &&
        requestPath === "/api/upload" &&
        contentLength > 0 &&
        onReceiveProgress
      ) {
        const percent = Math.min(
          100,
          Math.round((bodyBytesReceived / contentLength) * 100)
        );
        if (percent !== lastReportedPercent) {
          lastReportedPercent = percent;
          onReceiveProgress(incomingFileName, percent);
        }
      }
    }

    async function handleCompleteRequest() {
      const bodyBuffer = Buffer.concat(bodyChunks, bodyBytesReceived);

      if (method === "GET" && requestPath === "/api/ping") {
        sendJson(socket, 200, { ok: true, message: "LocalSend Mobile activo" });
        return;
      }

      if (method === "GET" && requestPath === "/api/info") {
        sendJson(socket, 200, {
          alias: "LocalSend Mobile",
          version: "1.0",
          deviceModel: "Android",
          deviceType: "mobile",
          port: PORT,
          protocol: "http",
          download: true,
        });
        return;
      }

      if (method === "POST" && requestPath === "/api/connect") {
        let deviceName = "Dispositivo desconocido";
        try {
          const data = JSON.parse(bodyBuffer.toString("utf8"));
          if (typeof data.deviceName === "string") {
            deviceName = data.deviceName;
          }
        } catch {}

        if (onConnectionRequest) {
          onConnectionRequest(
            deviceName,
            () => {
              sendJson(socket, 200, { ok: true, connected: true });
            },
            () => {
              sendJson(socket, 403, { ok: false, connected: false });
            }
          );
        } else {
          sendJson(socket, 403, { ok: false });
        }
        return;
      }

      if (method === "POST" && requestPath === "/api/upload") {
        const fileName = incomingFileName || `archivo-${Date.now()}`;
        const fileSize = headers["content-length"] || "desconocido";

        console.log(
          `\n[Mobile] 📥 Recibiendo archivo: "${fileName}" (${fileSize} bytes)...`
        );

        try {
          const tempPath = `${FileSystem.cacheDirectory}${fileName}`;
          const base64 = bodyBuffer.toString("base64");

          await FileSystem.writeAsStringAsync(tempPath, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });

          console.log(`[Mobile] ✅ Guardado en caché temporal: ${tempPath}`);

          if (onFileReceived) {
            onFileReceived(fileName, tempPath);
          }

          sendJson(socket, 200, {
            ok: true,
            message: "Archivo recibido correctamente",
            path: tempPath,
          });
        } catch (error) {
          console.error("[Mobile] ❌ Error procesando archivo:", error);
          sendJson(socket, 500, { ok: false, error: "Error guardando archivo" });
        }

        return;
      }

      sendJson(socket, 404, { ok: false, error: "Endpoint no encontrado" });
    }

    socket.on("data", (data: any) => {
      if (handled) return;
      const chunk = toBuffer(data);

      if (!headersParsed) {
        headerBuffer = Buffer.concat([headerBuffer, chunk]);
        const boundary = headerBuffer.indexOf("\r\n\r\n");
        if (boundary === -1) return;

        const headerText = headerBuffer.slice(0, boundary).toString("utf8");
        const rest = headerBuffer.slice(boundary + 4);

        const lines = headerText.split("\r\n");
        const [m, p] = lines[0].split(" ");
        method = m;
        requestPath = p;

        headers = {};
        for (let i = 1; i < lines.length; i++) {
          const idx = lines[i].indexOf(":");
          if (idx === -1) continue;
          headers[lines[i].slice(0, idx).trim().toLowerCase()] = lines[i]
            .slice(idx + 1)
            .trim();
        }

        contentLength = parseInt(headers["content-length"] || "0", 10) || 0;
        const rawName = headers["x-file-name"];
        incomingFileName = sanitizeFileName(
          rawName ? decodeURIComponent(rawName) : `archivo-${Date.now()}`
        );
        headersParsed = true;

        if (rest.length > 0) {
          bodyChunks.push(rest);
          bodyBytesReceived += rest.length;
        }

        reportProgressIfNeeded();

        if (bodyBytesReceived >= contentLength) {
          handled = true;
          handleCompleteRequest();
        }
        return;
      }

      bodyChunks.push(chunk);
      bodyBytesReceived += chunk.length;

      reportProgressIfNeeded();

      if (bodyBytesReceived >= contentLength) {
        handled = true;
        handleCompleteRequest();
      }
    });

    socket.on("error", (error) => {
      console.error("Error socket:", error);
    });
  });

  server.on("error", (error: any) => {
    console.error("Error servidor:", error);
    server = null;
  });

  server.listen({ host: "0.0.0.0", port: PORT, reuseAddress: true });
}

export function stopLocalServer() {
  if (server) {
    try {
      server.close();
    } catch {}
    server = null;
  }
}

export function getLocalServerPort() {
  return PORT;
}