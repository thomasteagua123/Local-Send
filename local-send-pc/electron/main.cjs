const {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
} = require("electron");
const path = require("node:path");
const http = require("node:http");

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

/**
 * Envía un evento al renderer.
 */
function sendToRenderer(channel, data) {
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
/**
 * Crea la ventana de Electron.
 */
function createWindow() {
  mainWindow = new BrowserWindow({
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

/**
 * Intenta conectarse con otro dispositivo.
 */
function connectToDevice(device) {
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
        `Conectando con ${device.name}`
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
                  showConnectionNotification(
                    device.name
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
          request.destroy();

          resolve({
            ok: false,
            error:
              "El dispositivo no respondió.",
          });
        }
      );

      request.on(
        "error",
        (error) => {
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
 * IPC
 * ==================================================
 *
 * IMPORTANTÍSIMO:
 * Los handlers se registran ANTES de crear
 * la ventana de Electron.
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
      id:
        "local-pc",

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
  async (_event, device) => {
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
    /*
     * Primero iniciamos la red.
     */
    try {
      const port =
        await createServer();

      const me =
        await publishDevice(
          port
        );

      /*
       * Guardamos nuestra PC solamente
       * internamente.
       */
      console.log(
        "PC publicada:",
        me
      );

      /*
       * Iniciamos descubrimiento.
       */
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

    /*
     * Ahora sí creamos la ventana.
     */
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