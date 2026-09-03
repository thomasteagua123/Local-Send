import { create } from "zustand";

export interface Device {
  id: string;
  name: string;
  host: string;
  address: string;
  port: number;
  type: string;
  platform: string;
}

interface DeviceStore {
  devices: Device[];

  addDevice: (device: Device) => void;
  removeDevice: (id: string) => void;
  clearDevices: () => void;
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  devices: [],

  addDevice: (device) =>
    set((state) => {
      const exists = state.devices.some(
        (item) => item.id === device.id
      );

      if (exists) {
        return {
          devices: state.devices.map((item) =>
            item.id === device.id ? device : item
          ),
        };
      }

      return {
        devices: [...state.devices, device],
      };
    }),

  removeDevice: (id) =>
    set((state) => ({
      devices: state.devices.filter(
        (device) => device.id !== id
      ),
    })),

  clearDevices: () => set({ devices: [] }),
}));