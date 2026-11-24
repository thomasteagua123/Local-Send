import { DragEvent, useEffect, useState } from "react";

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

interface TransferRecord {
  id: string;
  fileName: string;
  deviceName: string;
  timestamp: string;
  ok: boolean;
}

function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [searching, setSearching] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [sending, setSending] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [status, setStatus] = useState("Buscando dispositivos...");
  const [dragging, setDragging] = useState(false);
  const [history, setHistory] = useState<TransferRecord[]>([]);

  function recordTransfer(fileName: string, deviceName: string, ok: boolean) {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    setHistory((prev) => [
      {
        id: `${Date.now()}-${Math.random()}`,
        fileName,
        deviceName,
        timestamp,
        ok,
      },
      ...prev.slice(0, 29),
    ]);
  }

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const existing = await window.localSend.getDevices();
        if (!mounted) return;

        const filtered = existing.filter(
          (device: Device) => device.id !== "local-pc"
        );
        setDevices(filtered);
        setSearching(false);
      } catch (error) {
        console.error(error);
        if (mounted) {
          setSearching(false);
          setStatus("Error iniciando búsqueda");
        }
      }
    }

    initialize();

    const removeFound = window.localSend.onDeviceFound((device: Device) => {
      setDevices((current) => {
        const exists = current.some((item) => item.id === device.id);
        if (exists) {
          return current.map((item) =>
            item.id === device.id ? device : item
          );
        }
        return [...current, device];
      });

      setSearching(false);
      setStatus("Dispositivo encontrado");
    });

    const removeRemoved = window.localSend.onDeviceRemoved((id: string) => {
      setDevices((current) => current.filter((device) => device.id !== id));
      setSelectedDevice((current) => (current?.id === id ? null : current));
    });

    const removeProgress = window.localSend.onFileProgress?.(
      (data: { fileName: string; percent: number }) => {
        setProgressPercent(data.percent);
        setStatus(`Enviando "${data.fileName}" (${data.percent}%)...`);
      }
    );

    return () => {
      mounted = false;
      removeFound();
      removeRemoved();
      removeProgress?.();
    };
  }, []);

  async function refresh() {
    setSearching(true);
    setStatus("Buscando dispositivos...");

    try {
      const found = await window.localSend.searchDevices();
      const filtered = found.filter(
        (device: Device) => device.id !== "local-pc"
      );

      setDevices(filtered);
      setStatus(
        filtered.length > 0
          ? `${filtered.length} dispositivo(s) encontrado(s)`
          : "No se encontraron dispositivos"
      );
    } catch (error) {
      console.error(error);
      setStatus("Error buscando dispositivos");
    } finally {
      setSearching(false);
    }
  }

  async function selectDevice(device: Device) {
    if (connecting || sending) return;

    setConnecting(device.id);
    setStatus(
      `Conectando con ${device.name}... (Esperando autorización en el celular)`
    );

    try {
      const result = await window.localSend.connectDevice(device);

      if (result.ok) {
        setSelectedDevice(device);
        setStatus(`Conectado con ${device.name}`);
      } else {
        setStatus("El celular rechazó o no respondió a la conexión");
        setSelectedDevice(null);
        alert(
          `No se pudo conectar con ${device.name}\n\nEs posible que se haya rechazado la solicitud en el dispositivo móvil.`
        );
      }
    } catch (error) {
      console.error(error);
      setSelectedDevice(null);
      setStatus("Error de conexión");
    } finally {
      setConnecting(null);
    }
  }

  async function chooseFiles() {
    if (!selectedDevice) {
      alert("Primero seleccioná y conectate a un dispositivo.");
      return;
    }

    try {
      const filePaths = await window.localSend.selectFiles();
      if (!filePaths || filePaths.length === 0) return;
      await sendFiles(filePaths);
    } catch (error) {
      console.error(error);
      setStatus("No se pudieron seleccionar los archivos.");
    }
  }

  async function sendFiles(filePaths: string[]) {
    if (!selectedDevice) {
      alert("Primero seleccioná un dispositivo.");
      return;
    }
    if (!filePaths || filePaths.length === 0) return;

    setSending(true);
    setProgressPercent(0);

    let enviados = 0;

    try {
      for (const filePath of filePaths) {
        const fileName =
          filePath.split("\\").pop() || filePath.split("/").pop() || "archivo";

        const result: SendResult = await window.localSend.sendFile(
          selectedDevice,
          filePath
        );

        if (!result.ok) {
          recordTransfer(fileName, selectedDevice.name, false);
          throw new Error(result.error || `No se pudo enviar ${fileName}`);
        }

        recordTransfer(fileName, selectedDevice.name, true);
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
        error instanceof Error ? error.message : "Error enviando archivos"
      );
    } finally {
      setSending(false);
      setProgressPercent(0);
    }
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);

    if (!selectedDevice) {
      alert("Primero seleccioná un dispositivo.");
      return;
    }

    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;

    const filePaths = files
      .map((file) => window.localSend.getFilePath(file))
      .filter((filePath): filePath is string => Boolean(filePath));

    if (filePaths.length === 0) {
      setStatus("No se pudieron obtener los archivos.");
      return;
    }

    await sendFiles(filePaths);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedDevice) return;
    setDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>LocalSend PC</h1>
          <p>Transferencia de archivos en red local</p>
        </div>

        <div className="headerButtons">
          {selectedDevice && (
            <button
              className="actionButton browseHeaderButton"
              onClick={chooseFiles}
              disabled={sending}
              title="Buscar archivos para enviar"
            >
              📁 Seleccionar archivos
            </button>
          )}

          <button
            className="actionButton refreshButton"
            onClick={refresh}
            disabled={searching || connecting !== null || sending}
          >
            {searching ? "Buscando..." : "Buscar dispositivos"}
          </button>
        </div>
      </header>

      <section className="status">
        <div className={`statusDot ${sending ? "statusSending" : ""}`} />
        <span>{status}</span>
      </section>

      <main>
        <h2>Dispositivos cercanos</h2>

        {devices.length === 0 ? (
          <div className="empty">
            <div className="emptyIcon">📡</div>
            <h3>No hay dispositivos</h3>
            <p>
              Asegurate de que los dispositivos estén conectados a la misma red
              Wi-Fi.
            </p>
          </div>
        ) : (
          <div className="devices">
            {devices.map((device) => {
              const isSelected = selectedDevice?.id === device.id;
              const isConnecting = connecting === device.id;

              return (
                <article
                  className={`deviceCard ${isSelected ? "selected" : ""}`}
                  key={device.id}
                >
                  <div className="deviceIcon">
                    {device.platform === "windows" ? "💻" : "📱"}
                  </div>

                  <div className="deviceInfo">
                    <h3>{device.name}</h3>
                    <p>
                      {device.address}:{device.port}
                    </p>
                    <span>{device.platform}</span>
                  </div>

                  <div className="deviceAction">
                    {isConnecting ? (
                      <span className="connectingText">
                        Esperando al celular...
                      </span>
                    ) : isSelected ? (
                      <span className="selectedText">✓ Conectado</span>
                    ) : (
                      <button
                        className="connectButton"
                        disabled={connecting !== null || sending}
                        onClick={() => selectDevice(device)}
                      >
                        Conectar
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {selectedDevice && (
          <section className="sendSection">
            <div className="sendHeader">
              <div>
                <h2>Zona de Transferencia</h2>
                <p>
                  Destino actual: <strong>{selectedDevice.name}</strong>
                </p>
              </div>
              <button
                className="changeDeviceButton"
                onClick={() => setSelectedDevice(null)}
                disabled={sending}
              >
                Desconectar / Cambiar
              </button>
            </div>

            <div
              className={`dropZone ${dragging ? "dragging" : ""} ${
                sending ? "sending" : ""
              }`}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={chooseFiles}
            >
              <div className="dropContent">
                <div className="dropIconPulse">
                  {sending ? "📤" : dragging ? "📥" : "☁️"}
                </div>
                <h3>
                  {sending
                    ? `Enviando archivo... ${progressPercent}%`
                    : dragging
                    ? "¡Soltá los archivos aquí!"
                    : "Arrastrá tus archivos o hacé clic para buscar"}
                </h3>
                <p className="dropSubtext">
                  {sending
                    ? "El progreso de transferencia se actualiza en tiempo real."
                    : "Soporta cualquier tipo de archivo de forma directa y veloz."}
                </p>

                {sending && (
                  <div className="progressBarContainer">
                    <div
                      className="progressBarFill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* HISTORIAL DE TRANSFERENCIAS EN PC */}
        {history.length > 0 && (
          <section className="historySection">
            <div className="historyHeader">
              <h2>Historial de envíos</h2>
              <button
                className="changeDeviceButton"
                onClick={() => setHistory([])}
              >
                Limpiar historial
              </button>
            </div>

            <div className="historyList">
              {history.map((item) => (
                <div className="historyItem" key={item.id}>
                  <span className="historyItemIcon">📤</span>
                  <div className="historyItemInfo">
                    <strong>{item.fileName}</strong>
                    <span>
                      Enviado a {item.deviceName} · {item.timestamp}
                    </span>
                  </div>
                  <span
                    className={`historyItemBadge ${
                      item.ok ? "badgeOk" : "badgeErr"
                    }`}
                  >
                    {item.ok ? "✓ Enviado" : "✕ Error"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;