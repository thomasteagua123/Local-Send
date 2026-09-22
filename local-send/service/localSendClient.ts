/**
 * Cliente para hablar con OTROS dispositivos de este mismo clon
 * (celular <-> PC propios), usando el mini-protocolo casero que
 * ya implementan serverService.ts (celular) y server.js (PC):
 *
 *   POST /api/connect  -> handshake inicial
 *   POST /api/upload   -> mandar el archivo (bytes crudos)
 *   GET  /api/ping     -> chequeo rápido de que el server esté vivo
 *
 * Esto NO es el protocolo real de LocalSend (ese usa HTTPS, fingerprints,
 * sesiones con token, etc). Como tanto el celular como la PC son código
 * propio, no hace falta esa complejidad.
 */

export type TargetDevice = {
  address: string;
  port: number;
};

export type FileToSend = {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
};

export type ActionResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Chequeo liviano de que el dispositivo esté vivo antes de intentar
 * conectar de verdad. Usa la ruta GET /api/ping que ya tienen ambos lados.
 */
export async function pingDevice(device: TargetDevice): Promise<ActionResult> {
  try {
    const res = await fetch(
      `http://${device.address}:${device.port}/api/ping`
    );

    if (!res.ok) {
      return { ok: false, message: `El dispositivo respondió ${res.status}.` };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo alcanzar el dispositivo.",
    };
  }
}

/**
 * Handshake inicial: POST /api/connect con el nombre de este dispositivo.
 */
export async function connectToDevice(
  device: TargetDevice,
  myDeviceName: string
): Promise<ActionResult> {
  try {
    const res = await fetch(
      `http://${device.address}:${device.port}/api/connect`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: myDeviceName }),
      }
    );

    if (!res.ok) {
      return {
        ok: false,
        message: `El servidor respondió con estado ${res.status}.`,
      };
    }

    const data = await res.json();

    if (!data?.ok) {
      return {
        ok: false,
        message: data?.message ?? "El dispositivo rechazó la conexión.",
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Error de red al conectar.",
    };
  }
}

/**
 * Manda el archivo en sí: POST /api/upload con los bytes crudos
 * y la metadata en headers (igual a como ya lo hacía tu sendFileToDevice
 * original, solo que ahora vive acá).
 */
export async function sendFileToDevice(
  device: TargetDevice,
  file: FileToSend
): Promise<ActionResult> {
  try {
    const fileBlob = await (await fetch(file.uri)).blob();

    const res = await fetch(
      `http://${device.address}:${device.port}/api/upload`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
          "X-File-Size": String(file.size),
          "X-File-Type": file.mimeType,
        },
        body: fileBlob,
      }
    );

    if (!res.ok) {
      return {
        ok: false,
        message: `Falló la subida del archivo (estado ${res.status}).`,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Error de red al subir.",
    };
  }
}

/**
 * Orquesta el flujo completo del botón "Conectar":
 * ping -> connect -> upload.
 */
export async function connectAndSendFile(
  device: TargetDevice,
  myDeviceName: string,
  file: FileToSend
): Promise<ActionResult> {
  const ping = await pingDevice(device);
  if (!ping.ok) return ping;

  const connected = await connectToDevice(device, myDeviceName);
  if (!connected.ok) return connected;

  return sendFileToDevice(device, file);
}