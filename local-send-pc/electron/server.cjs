const http = require("node:http");

const DEFAULT_PORT = 53317;

let server = null;
let currentPort = null;

function createServer() {
  return new Promise((resolve, reject) => {
    const instance = http.createServer((req, res) => {
      // CORS básico para desarrollo
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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

        res.writeHead(200, {
          "Content-Type": "application/json",
        });

        res.end(JSON.stringify(response));
        return;
      }

      if (req.method === "GET" && req.url === "/api/ping") {
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

      res.writeHead(404, {
        "Content-Type": "application/json",
      });

      res.end(
        JSON.stringify({
          error: "Not found",
        })
      );
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
};