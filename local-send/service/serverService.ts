import TcpSocket from "react-native-tcp-socket";

const PORT = 53317;

let server: ReturnType<
  typeof TcpSocket.createServer
> | null = null;

let onConnectionRequest:
  | ((deviceName: string) => void)
  | null = null;

export function setConnectionHandler(
  handler: (deviceName: string) => void
) {
  onConnectionRequest = handler;
}

function sendJson(
  socket: any,
  statusCode: number,
  data: object
) {
  const body = JSON.stringify(data);

  const statusText =
    statusCode === 200
      ? "OK"
      : statusCode === 404
        ? "Not Found"
        : "Error";

  const response =
    `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
    "Content-Type: application/json; charset=utf-8\r\n" +
    `Content-Length: ${body.length}\r\n` +
    "Connection: close\r\n" +
    "\r\n" +
    body;

  try {
    socket.end(response);
  } catch (error) {
    console.error(
      "Error enviando respuesta:",
      error
    );
  }
}

export function startLocalServer() {
  if (server) {
    console.log(
      "Servidor mobile ya iniciado"
    );

    return;
  }

  server =
    TcpSocket.createServer(
      (socket) => {
        console.log(
          "Nueva conexión desde:",
          socket.remoteAddress
        );

        let requestData = "";
        let handled = false;

        socket.on(
          "data",
          (data) => {
            if (handled) {
              return;
            }

            requestData +=
              data.toString();

            if (
              !requestData.includes(
                "\r\n\r\n"
              )
            ) {
              return;
            }

            const headerEnd =
              requestData.indexOf(
                "\r\n\r\n"
              );

            const headers =
              requestData.substring(
                0,
                headerEnd
              );

            const body =
              requestData.substring(
                headerEnd + 4
              );

            const firstLine =
              headers.split(
                "\r\n"
              )[0];

            const [
              method,
              requestPath,
            ] = firstLine.split(
              " "
            );

            console.log(
              "Request:",
              firstLine
            );

            /*
             * PING
             */
            if (
              method === "GET" &&
              requestPath ===
                "/api/ping"
            ) {
              handled = true;

              sendJson(
                socket,
                200,
                {
                  ok: true,
                  message:
                    "LocalSend Mobile activo",
                }
              );

              return;
            }

            /*
             * INFO
             */
            if (
              method === "GET" &&
              requestPath ===
                "/api/info"
            ) {
              handled = true;

              sendJson(
                socket,
                200,
                {
                  alias:
                    "LocalSend Mobile",

                  version:
                    "1.0",

                  deviceModel:
                    "Android",

                  deviceType:
                    "mobile",

                  port:
                    PORT,

                  protocol:
                    "http",

                  download:
                    true,
                }
              );

              return;
            }

            /*
             * CONEXIÓN
             */
            if (
              method === "POST" &&
              requestPath ===
                "/api/connect"
            ) {
              handled = true;

              let deviceName =
                "Otro dispositivo";

              try {
                const data =
                  JSON.parse(body);

                if (
                  typeof data.deviceName ===
                  "string"
                ) {
                  deviceName =
                    data.deviceName;
                }
              } catch (error) {
                console.log(
                  "No se pudo interpretar body:",
                  error
                );
              }

              console.log(
                "Solicitud de conexión de:",
                deviceName
              );

              /*
               * Avisamos a la app.
               */
              if (
                onConnectionRequest
              ) {
                onConnectionRequest(
                  deviceName
                );
              }

              sendJson(
                socket,
                200,
                {
                  ok: true,
                  connected: true,
                  message:
                    `Conectado con ${deviceName}`,
                }
              );

              return;
            }

            handled = true;

            sendJson(
              socket,
              404,
              {
                ok: false,
                error:
                  "Endpoint no encontrado",
              }
            );
          }
        );

        socket.on(
          "error",
          (error) => {
            console.error(
              "Error socket:",
              error
            );
          }
        );

        socket.on(
          "close",
          () => {
            console.log(
              "Conexión cerrada"
            );
          }
        );
      }
    );

  server.on(
    "error",
    (error) => {
      console.error(
        "Error servidor:",
        error
      );
    }
  );

  server.on(
    "listening",
    () => {
      console.log(
        "================================"
      );

      console.log(
        "LocalSend Mobile HTTP iniciado"
      );

      console.log(
        `Escuchando en 0.0.0.0:${PORT}`
      );

      console.log(
        "================================"
      );
    }
  );

  server.on(
    "close",
    () => {
      console.log(
        "Servidor mobile detenido"
      );

      server = null;
    }
  );

  server.listen({
    host: "0.0.0.0",
    port: PORT,
    reuseAddress: true,
  });
}

export function stopLocalServer() {
  if (!server) {
    return;
  }

  try {
    server.close();
  } catch (error) {
    console.error(
      "Error cerrando servidor:",
      error
    );

    server = null;
  }
}

export function getLocalServerPort() {
  return PORT;
}