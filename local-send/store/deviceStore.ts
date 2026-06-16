import { create } from "zustand";

interface DeviceStore {
  devices: any[];
  setDevices: (devices: any[]) => void;
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  devices: [],
  setDevices: (devices) => set({ devices }),
}));