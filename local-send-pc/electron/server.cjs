const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const DEFAULT_PORT = 53317;

let server = null;
let currentPort = null;

// Se llama cuando otro dispositivo (el celular) pide conectarse.
// Conectá esto desde main.js para avisarle a la ventana de Electron
// (por ejemplo con mainWindow.webContents.send("connection-request", deviceName)).
let onConnectionRequest = null;

function setConnectionHandler(handler) {
  onConnectionRequest = handler;
}

// Carpeta donde se guardan los archivos recibidos.
const DOWNLOADS_DIR = path.join(os.homedir(), "Downloads", "LocalSend");

function ensureDownloadsDir() {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }
}

function sanitizeFileName(name) {
  return name.replace(/[/\\?%*:|"<>]/g, "_");
}

function createServer() {
  return new Promise((resolve, reject) => {
    const instance = http.createServer((req, res) => {
      // CORS básico para desarrollo
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, X-File-Name, X-File-Size, X-File-Type"
      );

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === "GET" && req.url === "/api/info") {
        const response = {
          alias: "LocalSend PC",
          version: "1.0",
          deviceModel: "Windows",
          deviceType: "desktop",
          port: currentPort,
          protocol: "http",
          download: true,
        };

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
        return;
      }

      if (req.method === "GET" && req.url === "/api/ping") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            message: "LocalSend PC activo",
          })
        );
        return;
      }

      // -----------------------------------------------------------------
      // NUEVO: acepta la solicitud de conexión que manda el celular.
      // -----------------------------------------------------------------
      if (req.method === "POST" && req.url === "/api/connect") {
        let body = "";

        req.on("data", (chunk) => {
          body += chunk;
        });

        req.on("end", () => {
          let deviceName = "Dispositivo desconocido";

          try {
            const data = JSON.parse(body);
            if (typeof data.deviceName === "string") {
              deviceName = data.deviceName;
            }
          } catch (error) {
            console.log("No se pudo interpretar el body:", error);
          }

          console.log("Solicitud de conexión de:", deviceName);

          if (onConnectionRequest) {
            onConnectionRequest(deviceName);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: true,
              connected: true,
              message: `Conectado con ${deviceName}`,
            })
          );
        });

        req.on("error", (error) => {
          console.error("Error leyendo body de /api/connect:", error);
        });

        return;
      }

      // -----------------------------------------------------------------
      // NUEVO: recibe el archivo que manda el celular.
      // -----------------------------------------------------------------
      if (req.method === "POST" && req.url === "/api/upload") {
        const rawName = req.headers["x-file-name"];
        const fileName = rawName
          ? sanitizeFileName(decodeURIComponent(rawName))
          : `archivo-${Date.now()}`;

        const chunks = [];

        req.on("data", (chunk) => {
          chunks.push(chunk);
        });

        req.on("end", () => {
          try {
            ensureDownloadsDir();

            const filePath = path.join(DOWNLOADS_DIR, fileName);
            const fileBuffer = Buffer.concat(chunks);

            fs.writeFileSync(filePath, fileBuffer);

            console.log("Archivo recibido:", filePath);

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                ok: true,
                message: `Archivo guardado en ${filePath}`,
              })
            );
          } catch (error) {
            console.error("Error guardando archivo:", error);

            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                ok: false,
                error: "No se pudo guardar el archivo",
              })
            );
          }
        });

        req.on("error", (error) => {
          console.error("Error leyendo body de /api/upload:", error);
        });

        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    });

    instance.on("error", reject);

    instance.listen(DEFAULT_PORT, "0.0.0.0", () => {
      currentPort = DEFAULT_PORT;
      server = instance;

      console.log(
        `Servidor LocalSend escuchando en 0.0.0.0:${currentPort}`
      );

      resolve(currentPort);
    });
  });
}

function getPort() {
  return currentPort;
}

function stopServer() {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }

    server.close(() => {
      server = null;
      currentPort = null;
      resolve();
    });
  });
}

module.exports = {
  createServer,
  getPort,
  stopServer,
  setConnectionHandler,
};