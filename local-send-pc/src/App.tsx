import {
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

function App() {
  const [
    devices,
    setDevices,
  ] = useState<Device[]>([]);

  const [
    searching,
    setSearching,
  ] = useState(true);

  const [
    connecting,
    setConnecting,
  ] = useState<string | null>(
    null
  );

  const [
    status,
    setStatus,
  ] = useState(
    "Buscando dispositivos..."
  );

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const existing =
          await window.localSend.getDevices();

        if (!mounted) return;

        setDevices(
          existing.filter(
            (device) =>
              device.platform !==
              "windows" ||
              device.id !==
                "local-pc"
          )
        );

        setSearching(false);
      } catch (error) {
        console.error(
          error
        );

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
        (device) => {
          setDevices(
            (current) => {
              const exists =
                current.some(
                  (item) =>
                    item.id ===
                    device.id
                );

              if (exists) {
                return current.map(
                  (item) =>
                    item.id ===
                    device.id
                      ? device
                      : item
                );
              }

              return [
                ...current,
                device,
              ];
            }
          );

          setSearching(false);

          setStatus(
            "Dispositivo encontrado"
          );
        }
      );

    const removeRemoved =
      window.localSend.onDeviceRemoved(
        (id) => {
          setDevices(
            (current) =>
              current.filter(
                (device) =>
                  device.id !== id
              )
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

      setDevices(
        found.filter(
          (device) =>
            device.id !==
            "local-pc"
        )
      );

      setStatus(
        found.length > 0
          ? `${found.length} dispositivo(s) encontrado(s)`
          : "No se encontraron dispositivos"
      );
    } catch (error) {
      console.error(
        error
      );

      setStatus(
        "Error buscando dispositivos"
      );
    } finally {
      setSearching(false);
    }
  }

  async function connect(
    device: Device
  ) {
    setConnecting(
      device.id
    );

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

        alert(
          `Conexión exitosa con ${device.name}`
        );
      } else {
        setStatus(
          `No se pudo conectar con ${device.name}`
        );

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
      console.error(
        error
      );

      setStatus(
        "Error de conexión"
      );
    } finally {
      setConnecting(
        null
      );
    }
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
            searching
          }
        >
          {searching
            ? "Buscando..."
            : "Buscar dispositivos"}
        </button>
      </header>

      <section className="status">
        <div className="statusDot" />

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
              (device) => (
                <article
                  className="deviceCard"
                  key={
                    device.id
                  }
                  onClick={() =>
                    connect(
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
                      {device.name}
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
                      {device.platform}
                    </span>
                  </div>

                  <button
                    className="connectButton"
                    disabled={
                      connecting ===
                      device.id
                    }
                    onClick={(
                      event
                    ) => {
                      event.stopPropagation();

                      connect(
                        device
                      );
                    }}
                  >
                    {connecting ===
                    device.id
                      ? "Conectando..."
                      : "Conectar"}
                  </button>
                </article>
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;