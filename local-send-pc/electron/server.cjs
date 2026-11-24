const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const DEFAULT_PORT = 53317;

let server = null;
let currentPort = null;

let onConnectionRequest = null;

function setConnectionHandler(handler) {
  onConnectionRequest = handler;
}

const DOWNLOADS_DIR = path.join(
  os.homedir(),
  "Downloads",
  "LocalSend"
);

function ensureDownloadsDir() {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, {
      recursive: true,
    });
  }
}

function sanitizeFileName(name) {
  return name.replace(/[\/\\?%*:|"<>]/g, "_");
}

function getAvailableFilePath(fileName) {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);

  let finalName = fileName;
  let counter = 1;

  while (
    fs.existsSync(path.join(DOWNLOADS_DIR, finalName))
  ) {
    finalName = `${baseName} (${counter})${extension}`;
    counter++;
  }

  return path.join(DOWNLOADS_DIR, finalName);
}

function createServer(port = DEFAULT_PORT) {
  return new Promise((resolve, reject) => {
    const instance = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, X-File-Name, X-File-Size, X-File-Type"
      );

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // Parseo flexible de URL para ignorar Query Strings (?v=1) y barras finales (/api/upload/)
      const parsedUrl = new URL(
        req.url,
        `http://${req.headers.host || "localhost"}`
      );
      const pathname = parsedUrl.pathname.replace(/\/$/, "");

      /*
       * ==========================================
       * INFO
       * ==========================================
       */
      if (req.method === "GET" && (pathname === "/api/info" || pathname === "/api/localsend/v2/info")) {
        const response = {
          alias: "LocalSend PC",
          version: "1.0",
          deviceModel: "Windows",
          deviceType: "desktop",
          port: currentPort,
          protocol: "http",
          download: true,
        };

        res.writeHead(200, {
          "Content-Type": "application/json",
        });
        res.end(JSON.stringify(response));
        return;
      }

      /*
       * ==========================================
       * PING
       * ==========================================
       */
      if (req.method === "GET" && pathname === "/api/ping") {
        res.writeHead(200, {
          "Content-Type": "application/json",
        });
        res.end(
          JSON.stringify({
            ok: true,
            message: "LocalSend PC activo",
          })
        );
        return;
      }

      /*
       * ==========================================
       * CONEXIÓN
       * ==========================================
       */
      if (req.method === "POST" && pathname === "/api/connect") {
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
            console.log(
              "No se pudo interpretar el body:",
              error
            );
          }

          console.log(
            "Solicitud de conexión de:",
            deviceName
          );

          if (onConnectionRequest) {
            onConnectionRequest(deviceName);
          }

          res.writeHead(200, {
            "Content-Type": "application/json",
          });
          res.end(
            JSON.stringify({
              ok: true,
              connected: true,
              message: `Conectado con ${deviceName}`,
            })
          );
        });

        req.on("error", (error) => {
          console.error(
            "Error leyendo body de /api/connect:",
            error
          );
        });

        return;
      }

      /*
       * ==========================================
       * RECIBIR ARCHIVO
       * ==========================================
       */
      if (req.method === "POST" && pathname === "/api/upload") {
        const rawName = req.headers["x-file-name"];

        let fileName = rawName
          ? decodeURIComponent(rawName)
          : `archivo-${Date.now()}`;

        fileName = sanitizeFileName(fileName);

        ensureDownloadsDir();

        const filePath = getAvailableFilePath(fileName);

        console.log("Recibiendo archivo:", fileName);
        console.log("Guardando en:", filePath);

        const writeStream = fs.createWriteStream(filePath);
        let hasError = false;

        req.on("error", (error) => {
          hasError = true;
          console.error("Error recibiendo archivo:", error);

          writeStream.destroy();

          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch {}

          if (!res.headersSent) {
            res.writeHead(500, {
              "Content-Type": "application/json",
            });
            res.end(
              JSON.stringify({
                ok: false,
                error: "Error al recibir el archivo",
              })
            );
          }
        });

        writeStream.on("error", (error) => {
          hasError = true;
          console.error("Error escribiendo archivo:", error);

          if (!res.headersSent) {
            res.writeHead(500, {
              "Content-Type": "application/json",
            });
            res.end(
              JSON.stringify({
                ok: false,
                error: "Error al guardar el archivo localmente",
              })
            );
          }
        });

        writeStream.on("finish", () => {
          if (!hasError && !res.headersSent) {
            console.log("Archivo guardado exitosamente:", filePath);
            res.writeHead(200, {
              "Content-Type": "application/json",
            });
            res.end(
              JSON.stringify({
                ok: true,
                message: "Archivo recibido correctamente",
                filePath,
              })
            );
          }
        });

        req.pipe(writeStream);
        return;
      }

      /*
       * ==========================================
       * 404 NOT FOUND
       * ==========================================
       */
      res.writeHead(404, {
        "Content-Type": "application/json",
      });
      res.end(
        JSON.stringify({
          ok: false,
          error: "Endpoint no encontrado",
          pathRequested: pathname,
        })
      );
    });

    instance.on("error", (error) => {
      console.error("Error en el servidor HTTP:", error);
      reject(error);
    });

    instance.listen(port, () => {
      server = instance;
      currentPort = port;
      console.log(`Servidor HTTP escuchando en el puerto ${port}`);
      resolve(port);
    });
  });
}

function getPort() {
  return currentPort;
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        server = null;
        currentPort = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

module.exports = {
  createServer,
  getPort,
  stopServer,
  setConnectionHandler,
};