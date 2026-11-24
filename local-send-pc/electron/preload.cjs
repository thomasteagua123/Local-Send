const {
  contextBridge,
  ipcRenderer,
  webUtils,
} = require("electron");

contextBridge.exposeInMainWorld(
  "localSend",
  {
    getDevices: () =>
      ipcRenderer.invoke(
        "devices:get"
      ),

    searchDevices: () =>
      ipcRenderer.invoke(
        "devices:search"
      ),

    getMyDevice: () =>
      ipcRenderer.invoke(
        "device:me"
      ),

    connectDevice: (device) =>
      ipcRenderer.invoke(
        "device:connect",
        device
      ),

    selectFiles: () =>
      ipcRenderer.invoke(
        "files:select"
      ),

    sendFile: (
      device,
      filePath
    ) =>
      ipcRenderer.invoke(
        "file:send",
        {
          device,
          filePath,
        }
      ),

    getFilePath: (file) => {
      try {
        return webUtils.getPathForFile(
          file
        );
      } catch (error) {
        console.error(
          "No se pudo obtener la ruta del archivo:",
          error
        );

        return null;
      }
    },

    onDeviceFound: (
      callback
    ) => {
      const listener =
        (_event, device) => {
          callback(device);
        };

      ipcRenderer.on(
        "device:found",
        listener
      );

      return () => {
        ipcRenderer.removeListener(
          "device:found",
          listener
        );
      };
    },

    onDeviceRemoved: (
      callback
    ) => {
      const listener =
        (_event, id) => {
          callback(id);
        };

      ipcRenderer.on(
        "device:removed",
        listener
      );

      return () => {
        ipcRenderer.removeListener(
          "device:removed",
          listener
        );
      };
    },
  }
);