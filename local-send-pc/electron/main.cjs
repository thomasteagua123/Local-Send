const {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  dialog,
} = require("electron");

const path = require("node:path");
const http = require("node:http");
const fs = require("node:fs");

const {
  createServer,
  getPort,
} = require("./server.cjs");

const {
  publishDevice,
  startDiscovery,
  shutdown,
  getLocalIPv4,
} = require("./discovery.cjs");

let mainWindow = null;

const devices = new Map();

/*
 * ==================================================
 * UTILIDADES
 * ==================================================
 */

function sendToRenderer(
  channel,
  data
) {
  if (
    mainWindow &&
    !mainWindow.isDestroyed()
  ) {
    mainWindow.webContents.send(
      channel,
      data
    );
  }
}

function showConnectionNotification(
  deviceName
) {
  if (
    !Notification.isSupported()
  ) {
    return;
  }

  new Notification({
    title: "LocalSend",
    body: `Conexión establecida con ${deviceName}`,
  }).show();
}

function showFileNotification(
  deviceName,
  fileName
) {
  if (
    !Notification.isSupported()
  ) {
    return;
  }

  new Notification({
    title: "LocalSend",
    body: `${fileName} enviado a ${deviceName}`,
  }).show();
}

function getFileName(
  filePath
) {
  return (
    path.basename(filePath) ||
    "archivo"
  );
}

function getMimeType(
  filePath
) {
  const extension =
    path
      .extname(filePath)
      .toLowerCase();

  const mimeTypes = {
    ".txt": "text/plain",
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".json": "application/json",

    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",

    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",

    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",

    ".pdf": "application/pdf",

    ".zip": "application/zip",
    ".rar":
      "application/vnd.rar",

    ".doc":
      "application/msword",

    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

    ".xls":
      "application/vnd.ms-excel",

    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };

  return (
    mimeTypes[extension] ||
    "application/octet-stream"
  );
}

/*
 * ==================================================
 * VENTANA
 * ==================================================
 */

function createWindow() {
  mainWindow =
    new BrowserWindow({
      width: 1100,
      height: 750,

      minWidth: 850,
      minHeight: 600,

      webPreferences: {
        preload: path.join(
          __dirname,
          "preload.cjs"
        ),

        contextIsolation: true,
        nodeIntegration: false,
      },
    });

  if (!app.isPackaged) {
    mainWindow.loadURL(
      "http://localhost:5173"
    );

    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(
        __dirname,
        "../dist/index.html"
      )
    );
  }
}

/*
 * ==================================================
 * CONEXIÓN BILATERAL
 * ==================================================
 */

function connectToDevice(
  device
) {
  return new Promise(
    (resolve) => {
      if (
        !device ||
        !device.address ||
        !device.port
      ) {
        resolve({
          ok: false,
          error:
            "Datos del dispositivo inválidos.",
        });

        return;
      }

      console.log(
        `[PC] 🔗 Iniciando conexión bilateral con ${device.name} (${device.address}:${device.port})`
      );

      const postData =
        JSON.stringify({
          deviceName:
            `LocalSend PC - ${getLocalIPv4()}`,
        });

      const request =
        http.request(
          {
            hostname:
              device.address,

            port:
              device.port,

            path:
              "/api/connect",

            method:
              "POST",

            timeout: 5000,

            headers: {
              "Content-Type":
                "application/json",

              "Content-Length":
                Buffer.byteLength(
                  postData
                ),
            },
          },

          (response) => {
            let body = "";

            response.on(
              "data",
              (chunk) => {
                body += chunk;
              }
            );

            response.on(
              "end",
              () => {
                const ok =
                  response.statusCode ===
                  200;

                if (ok) {
                  console.log(
                    `[PC] ✅ Conexión bilateral establecida con éxito con ${device.name}`
                  );

                  showConnectionNotification(
                    device.name
                  );
                } else {
                  console.error(
                    `[PC] ❌ El dispositivo rechazó la conexión (HTTP ${response.statusCode}):`,
                    body
                  );
                }

                resolve({
                  ok,
                  status:
                    response.statusCode,
                  body,
                });
              }
            );
          }
        );

      request.on(
        "timeout",
        () => {
          console.error(
            "[PC] ❌ Tiempo de espera agotado conectando con:",
            device.name
          );

          request.destroy();

          resolve({
            ok: false,
            error:
              "El dispositivo no respondió a la solicitud de conexión.",
          });
        }
      );

      request.on(
        "error",
        (error) => {
          console.error(
            "[PC] ❌ Error en la solicitud de conexión:",
            error
          );

          resolve({
            ok: false,
            error:
              error.message,
          });
        }
      );

      request.write(
        postData
      );

      request.end();
    }
  );
}

/*
 * ==================================================
 * SELECCIONAR ARCHIVOS
 * ==================================================
 */

ipcMain.handle(
  "files:select",
  async () => {
    const result =
      await dialog.showOpenDialog(
        mainWindow,
        {
          title:
            "Seleccionar archivos",

          properties: [
            "openFile",
            "multiSelections",
          ],
        }
      );

    if (
      result.canceled
    ) {
      return [];
    }

    return result.filePaths;
  }
);

/*
 * ==================================================
 * ENVIAR ARCHIVO (CON PROGRESO)
 * ==================================================
 */

function sendFileToDevice(
  device,
  filePath
) {
  return new Promise(
    (resolve) => {
      if (
        !device ||
        !device.address ||
        !device.port
      ) {
        resolve({
          ok: false,
          error:
            "Dispositivo inválido.",
        });

        return;
      }

      if (
        !filePath ||
        !fs.existsSync(filePath)
      ) {
        resolve({
          ok: false,
          error:
            "El archivo no existe.",
        });

        return;
      }

      let fileStats;

      try {
        fileStats =
          fs.statSync(
            filePath
          );
      } catch (error) {
        resolve({
          ok: false,
          error:
            "No se pudo leer el archivo.",
        });

        return;
      }

      const fileName =
        getFileName(
          filePath
        );

      const mimeType =
        getMimeType(
          filePath
        );

      console.log(
        `\n[PC] 🚀 Iniciando envío de "${fileName}" a ${device.name} (${fileStats.size} bytes)...`
      );

      const request =
        http.request(
          {
            hostname:
              device.address,

            port:
              device.port,

            path:
              "/api/upload",

            method:
              "POST",

            timeout:
              120000,

            headers: {
              "Content-Type":
                "application/octet-stream",

              "Content-Length":
                fileStats.size,

              "X-File-Name":
                encodeURIComponent(
                  fileName
                ),

              "X-File-Size":
                String(
                  fileStats.size
                ),

              "X-File-Type":
                mimeType,
            },
          },

          (response) => {
            let body = "";

            response.on(
              "data",
              (chunk) => {
                body += chunk;
              }
            );

            response.on(
              "end",
              () => {
                const ok =
                  response.statusCode >=
                    200 &&
                  response.statusCode <
                    300;

                if (ok) {
                  console.log(
                    `[PC] ✅ ¡Archivo enviado y recibido con éxito por el celular! -> ${fileName}`
                  );

                  showFileNotification(
                    device.name,
                    fileName
                  );

                  resolve({
                    ok: true,
                    fileName,
                    status:
                      response.statusCode,
                    body,
                  });
                } else {
                  console.error(
                    `[PC] ❌ El celular rechazó el archivo (HTTP ${response.statusCode}):`,
                    body
                  );

                  resolve({
                    ok: false,
                    fileName,
                    status:
                      response.statusCode,
                    error:
                      `El dispositivo respondió con HTTP ${response.statusCode}`,
                    body,
                  });
                }
              }
            );
          }
        );

      request.on(
        "timeout",
        () => {
          console.error(
            "[PC] ❌ Tiempo de espera agotado enviando:",
            fileName
          );

          request.destroy();

          resolve({
            ok: false,
            fileName,
            error:
              "Tiempo de espera agotado al enviar el archivo.",
          });
        }
      );

      request.on(
        "error",
        (error) => {
          console.error(
            "[PC] ❌ Error enviando archivo:",
            error
          );

          resolve({
            ok: false,
            fileName,
            error:
              error.message,
          });
        }
      );

      const fileStream =
        fs.createReadStream(
          filePath,
          { highWaterMark: 64 * 1024 }
        );

      let bytesSent = 0;

      fileStream.on(
        "data",
        (chunk) => {
          bytesSent += chunk.length;
          const percent = Math.min(
            100,
            Math.round(
              (bytesSent / fileStats.size) * 100
            )
          );

          sendToRenderer(
            "file:progress",
            {
              fileName,
              percent,
              bytesSent,
              totalBytes: fileStats.size,
            }
          );
        }
      );

      fileStream.on(
        "error",
        (error) => {
          console.error(
            "[PC] ❌ Error leyendo archivo local:",
            error
          );

          request.destroy();

          resolve({
            ok: false,
            fileName,
            error:
              error.message,
          });
        }
      );

      fileStream.pipe(
        request
      );
    }
  );
}

ipcMain.handle(
  "file:send",
  async (
    _event,
    {
      device,
      filePath,
    }
  ) => {
    return await sendFileToDevice(
      device,
      filePath
    );
  }
);

/*
 * ==================================================
 * IPC DISPOSITIVOS
 * ==================================================
 */

ipcMain.handle(
  "devices:get",
  () => {
    return Array.from(
      devices.values()
    );
  }
);

ipcMain.handle(
  "devices:search",
  () => {
    return Array.from(
      devices.values()
    );
  }
);

ipcMain.handle(
  "device:me",
  () => {
    return {
      id: "local-pc",

      name:
        `LocalSend PC - ${getLocalIPv4()}`,

      address:
        getLocalIPv4(),

      port:
        getPort(),

      platform:
        "windows",
    };
  }
);

ipcMain.handle(
  "device:connect",
  async (
    _event,
    device
  ) => {
    return await connectToDevice(
      device
    );
  }
);

/*
 * ==================================================
 * INICIO
 * ==================================================
 */

app.whenReady().then(
  async () => {
    try {
      const port =
        await createServer();

      const me =
        await publishDevice(
          port
        );

      console.log(
        "PC publicada:",
        me
      );

      await startDiscovery(
        (device) => {
          console.log(
            "================================"
          );

          console.log(
            "DISPOSITIVO ENCONTRADO"
          );

          console.log(
            device
          );

          console.log(
            "================================"
          );

          devices.set(
            device.id,
            device
          );

          sendToRenderer(
            "device:found",
            device
          );
        },

        (id) => {
          console.log(
            "Dispositivo eliminado:",
            id
          );

          devices.delete(id);

          sendToRenderer(
            "device:removed",
            id
          );
        }
      );

      console.log(
        "=============================="
      );

      console.log(
        "LocalSend PC iniciado"
      );

      console.log(
        "IP:",
        getLocalIPv4()
      );

      console.log(
        "Puerto:",
        getPort()
      );

      console.log(
        "=============================="
      );
    } catch (error) {
      console.error(
        "Error iniciando LocalSend:",
        error
      );
    }

    createWindow();

    app.on(
      "activate",
      () => {
        if (
          BrowserWindow.getAllWindows()
            .length === 0
        ) {
          createWindow();
        }
      }
    );
  }
);

app.on(
  "window-all-closed",
  async () => {
    await shutdown();

    if (
      process.platform !==
      "darwin"
    ) {
      app.quit();
    }
  }
);