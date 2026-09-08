const os = require("node:os");

let BonjourClass = null;
let bonjour = null;

let browser = null;
let publishedService = null;

const SERVICE_TYPE = "localsend";
const SERVICE_PROTOCOL = "tcp";
const SERVICE_DOMAIN = "local.";

const DEVICE_ID =
  `${os.hostname()}-${process.pid}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

function getLocalIPv4() {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const network of interfaces[name] || []) {
      if (
        network.family === "IPv4" &&
        !network.internal
      ) {
        return network.address;
      }
    }
  }

  return "127.0.0.1";
}

async function initBonjour() {
  if (!BonjourClass) {
    const module = await import("bonjour-service");

    BonjourClass =
      module.Bonjour ||
      module.default;
  }

  if (!bonjour) {
    bonjour = new BonjourClass(
      {},
      (error) => {
        console.error(
          "Error Bonjour:",
          error
        );
      }
    );
  }

  return bonjour;
}

async function publishDevice(port) {
  await initBonjour();

  if (publishedService) {
    try {
      publishedService.stop();
    } catch {
      // ignorar
    }
  }

  const deviceName =
    `LocalSend PC - ${os.hostname()}`;

  publishedService = bonjour.publish({
    name: deviceName,
    type: SERVICE_TYPE,
    protocol: SERVICE_PROTOCOL,
    port,
    txt: {
      id: DEVICE_ID,
      deviceName,
      platform: "windows",
      version: "1.0",
    },
  });

  publishedService.on("error", (error) => {
    console.error(
      "Error publicando servicio:",
      error
    );
  });

  console.log(
    "PC publicada:",
    deviceName,
    getLocalIPv4(),
    port
  );

  return {
    id: DEVICE_ID,
    name: deviceName,
    address: getLocalIPv4(),
    port,
    platform: "windows",
  };
}

async function startDiscovery(onDeviceFound, onDeviceRemoved) {
  await initBonjour();

  if (browser) {
    browser.stop();
  }

  browser = bonjour.find({
    type: SERVICE_TYPE,
    protocol: SERVICE_PROTOCOL,
  });

  browser.on("up", (service) => {
    const txt = service.txt || {};

    if (txt.id === DEVICE_ID) {
      return;
    }

    const address =
      service.addresses?.find(
        (item) =>
          typeof item === "string" &&
          item.includes(".")
      ) ||
      service.host;

    const device = {
      id:
        txt.id ||
        service.fqdn ||
        service.name,

      name:
        txt.deviceName ||
        service.name ||
        "Dispositivo",

      address,
      host: service.host,
      port: service.port,

      platform:
        txt.platform ||
        "unknown",

      version:
        txt.version ||
        "unknown",
    };

    console.log(
      "Dispositivo encontrado:",
      device
    );

    onDeviceFound(device);
    console.log(
  "=============================="
);

console.log(
  "SERVICIO MDNS RECIBIDO:"
);

console.log(
  JSON.stringify(
    service,
    null,
    2
  )
);

console.log(
  "=============================="
);
});

  browser.on("down", (service) => {
    const id =
      service.txt?.id ||
      service.fqdn ||
      service.name;

    console.log(
      "Dispositivo desconectado:",
      id
    );

    onDeviceRemoved?.(id);
  });

  browser.on("error", (error) => {
    console.error(
      "Error durante discovery:",
      error
    );
  });

  console.log(
    "Buscando dispositivos LocalSend..."
  );

  return {
    stop() {
      if (browser) {
        browser.stop();
        browser = null;
      }
    },
  };
}

async function stopDiscovery() {
  if (browser) {
    browser.stop();
    browser = null;
  }
}

async function shutdown() {
  await stopDiscovery();

  if (publishedService) {
    try {
      publishedService.stop();
    } catch {
      // ignorar
    }

    publishedService = null;
  }

  if (bonjour) {
    try {
      bonjour.destroy();
    } catch {
      // ignorar
    }

    bonjour = null;
  }
}

module.exports = {
  publishDevice,
  startDiscovery,
  stopDiscovery,
  shutdown,
  getLocalIPv4,
};