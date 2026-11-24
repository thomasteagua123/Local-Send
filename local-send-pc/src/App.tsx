import {
  DragEvent,
  useEffect,
  useState,
} from "react";

interface Device {
  id: string;
  name: string;
  address: string;
  host?: string;
  port: number;
  platform: string;
  version?: string;
}

interface SendResult {
  ok: boolean;
  fileName?: string;
  error?: string;
}

function App() {
  const [devices, setDevices] =
    useState<Device[]>([]);

  const [searching, setSearching] =
    useState(true);

  const [connecting, setConnecting] =
    useState<string | null>(null);

  const [selectedDevice, setSelectedDevice] =
    useState<Device | null>(null);

  const [sending, setSending] =
    useState(false);

  const [status, setStatus] =
    useState(
      "Buscando dispositivos..."
    );

  const [dragging, setDragging] =
    useState(false);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const existing =
          await window.localSend.getDevices();

        if (!mounted) return;

        setDevices(
          existing.filter(
            (device: Device) =>
              device.id !== "local-pc"
          )
        );

        setSearching(false);
      } catch (error) {
        console.error(error);

        if (mounted) {
          setSearching(false);

          setStatus(
            "Error iniciando búsqueda"
          );
        }
      }
    }

    initialize();

    const removeFound =
      window.localSend.onDeviceFound(
        (device: Device) => {
          setDevices((current) => {
            const exists =
              current.some(
                (item) =>
                  item.id === device.id
              );

            if (exists) {
              return current.map(
                (item) =>
                  item.id === device.id
                    ? device
                    : item
              );
            }

            return [
              ...current,
              device,
            ];
          });

          setSearching(false);

          setStatus(
            "Dispositivo encontrado"
          );
        }
      );

    const removeRemoved =
      window.localSend.onDeviceRemoved(
        (id: string) => {
          setDevices((current) =>
            current.filter(
              (device) =>
                device.id !== id
            )
          );

          setSelectedDevice(
            (current) =>
              current?.id === id
                ? null
                : current
          );
        }
      );

    return () => {
      mounted = false;

      removeFound();
      removeRemoved();
    };
  }, []);

  async function refresh() {
    setSearching(true);

    setStatus(
      "Buscando dispositivos..."
    );

    try {
      const found =
        await window.localSend.searchDevices();

      const filtered =
        found.filter(
          (device: Device) =>
            device.id !== "local-pc"
        );

      setDevices(filtered);

      setStatus(
        filtered.length > 0
          ? `${filtered.length} dispositivo(s) encontrado(s)`
          : "No se encontraron dispositivos"
      );
    } catch (error) {
      console.error(error);

      setStatus(
        "Error buscando dispositivos"
      );
    } finally {
      setSearching(false);
    }
  }

  async function selectDevice(
    device: Device
  ) {
    if (connecting || sending) {
      return;
    }

    setSelectedDevice(device);

    setConnecting(device.id);

    setStatus(
      `Conectando con ${device.name}...`
    );

    try {
      const result =
        await window.localSend.connectDevice(
          device
        );

      if (result.ok) {
        setStatus(
          `Conectado con ${device.name}`
        );
      } else {
        setStatus(
          `No se pudo conectar con ${device.name}`
        );

        setSelectedDevice(null);

        alert(
          `No se pudo conectar con ${
            device.name
          }\n\n${
            result.error ||
            "El dispositivo no respondió."
          }`
        );
      }
    } catch (error) {
      console.error(error);

      setSelectedDevice(null);

      setStatus(
        "Error de conexión"
      );
    } finally {
      setConnecting(null);
    }
  }

  async function chooseFiles() {
    if (!selectedDevice) {
      alert(
        "Primero seleccioná un dispositivo."
      );

      return;
    }

    try {
      const filePaths =
        await window.localSend.selectFiles();

      if (
        !filePaths ||
        filePaths.length === 0
      ) {
        return;
      }

      await sendFiles(filePaths);
    } catch (error) {
      console.error(error);

      setStatus(
        "No se pudieron seleccionar los archivos."
      );
    }
  }

  async function sendFiles(
    filePaths: string[]
  ) {
    if (!selectedDevice) {
      alert(
        "Primero seleccioná un dispositivo."
      );

      return;
    }

    if (
      !filePaths ||
      filePaths.length === 0
    ) {
      return;
    }

    setSending(true);

    let enviados = 0;

    try {
      for (
        const filePath of filePaths
      ) {
        const fileName =
          filePath
            .split("\\")
            .pop() ||
          filePath
            .split("/")
            .pop() ||
          "archivo";

        setStatus(
          `Enviando ${fileName}...`
        );

        const result: SendResult =
          await window.localSend.sendFile(
            selectedDevice,
            filePath
          );

        if (!result.ok) {
          throw new Error(
            result.error ||
              `No se pudo enviar ${fileName}`
          );
        }

        enviados++;
      }

      setStatus(
        enviados === 1
          ? "Archivo enviado correctamente"
          : `${enviados} archivos enviados correctamente`
      );
    } catch (error) {
      console.error(error);

      setStatus(
        error instanceof Error
          ? error.message
          : "Error enviando archivos"
      );
    } finally {
      setSending(false);
    }
  }

  async function handleDrop(
    event: DragEvent<HTMLDivElement>
  ) {
    event.preventDefault();
    event.stopPropagation();

    setDragging(false);

    if (
      !selectedDevice
    ) {
      alert(
        "Primero seleccioná un dispositivo."
      );

      return;
    }

    const files =
      Array.from(
        event.dataTransfer.files
      );

    if (files.length === 0) {
      return;
    }

    const filePaths =
      files
        .map(
          (file) =>
            window.localSend.getFilePath(
              file
            )
        )
        .filter(
          (
            filePath
          ): filePath is string =>
            Boolean(filePath)
        );

    if (
      filePaths.length === 0
    ) {
      setStatus(
        "No se pudieron obtener los archivos."
      );

      return;
    }

    await sendFiles(
      filePaths
    );
  }

  function handleDragOver(
    event: DragEvent<HTMLDivElement>
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (!selectedDevice) {
      return;
    }

    setDragging(true);
  }

  function handleDragLeave(
    event: DragEvent<HTMLDivElement>
  ) {
    event.preventDefault();
    event.stopPropagation();

    setDragging(false);
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>
            LocalSend PC
          </h1>

          <p>
            Transferencia de
            archivos en red local
          </p>
        </div>

        <button
          className="refreshButton"
          onClick={refresh}
          disabled={
            searching ||
            connecting !== null ||
            sending
          }
        >
          {searching
            ? "Buscando..."
            : "Buscar dispositivos"}
        </button>
      </header>

      <section className="status">
        <div
          className={`statusDot ${
            sending
              ? "statusSending"
              : ""
          }`}
        />

        <span>
          {status}
        </span>
      </section>

      <main>
        <h2>
          Dispositivos cercanos
        </h2>

        {devices.length ===
        0 ? (
          <div className="empty">
            <div className="emptyIcon">
              📡
            </div>

            <h3>
              No hay dispositivos
            </h3>

            <p>
              Asegurate de que los
              dispositivos estén
              conectados a la misma
              red Wi-Fi.
            </p>
          </div>
        ) : (
          <div className="devices">
            {devices.map(
              (device) => {
                const isSelected =
                  selectedDevice?.id ===
                  device.id;

                const isConnecting =
                  connecting ===
                  device.id;

                return (
                  <article
                    className={`deviceCard ${
                      isSelected
                        ? "selected"
                        : ""
                    }`}
                    key={
                      device.id
                    }
                    onClick={() =>
                      selectDevice(
                        device
                      )
                    }
                  >
                    <div className="deviceIcon">
                      {device.platform ===
                      "windows"
                        ? "💻"
                        : "📱"}
                    </div>

                    <div className="deviceInfo">
                      <h3>
                        {
                          device.name
                        }
                      </h3>

                      <p>
                        {
                          device.address
                        }
                        :
                        {
                          device.port
                        }
                      </p>

                      <span>
                        {
                          device.platform
                        }
                      </span>
                    </div>

                    <div className="deviceAction">
                      {isConnecting ? (
                        <span className="connectingText">
                          Conectando...
                        </span>
                      ) : isSelected ? (
                        <span className="selectedText">
                          ✓ Seleccionado
                        </span>
                      ) : (
                        <button
                          className="connectButton"
                          disabled={
                            connecting !==
                              null ||
                            sending
                          }
                          onClick={(
                            event
                          ) => {
                            event.stopPropagation();

                            selectDevice(
                              device
                            );
                          }}
                        >
                          Seleccionar
                        </button>
                      )}
                    </div>
                  </article>
                );
              }
            )}
          </div>
        )}

        {selectedDevice && (
          <section className="sendSection">
            <div className="sendHeader">
              <div>
                <h2>
                  Enviar archivos
                </h2>

                <p>
                  Destino:{" "}
                  <strong>
                    {
                      selectedDevice.name
                    }
                  </strong>
                </p>
              </div>
            </div>

            <div
              className={`dropZone ${
                dragging
                  ? "dragging"
                  : ""
              } ${
                sending
                  ? "sending"
                  : ""
              }`}
              onDragOver={
                handleDragOver
              }
              onDragEnter={
                handleDragOver
              }
              onDragLeave={
                handleDragLeave
              }
              onDrop={
                handleDrop
              }
            >
              <div className="dropIcon">
                {sending
                  ? "📤"
                  : dragging
                  ? "📥"
                  : "📁"}
              </div>

              <h3>
                {sending
                  ? "Enviando archivos..."
                  : dragging
                  ? "Soltá los archivos aquí"
                  : "Arrastrá archivos aquí"}
              </h3>

              {!sending && (
                <>
                  <p>
                    o buscá los archivos
                    manualmente
                  </p>

                  <button
                    className="browseButton"
                    onClick={
                      chooseFiles
                    }
                    disabled={
                      sending
                    }
                  >
                    📂 Buscar archivos
                  </button>
                </>
              )}
            </div>

            <button
              className="changeDeviceButton"
              onClick={() =>
                setSelectedDevice(
                  null
                )
              }
              disabled={sending}
            >
              Cambiar dispositivo
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;