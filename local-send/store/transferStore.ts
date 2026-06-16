import { create } from "zustand";

export const useTransferStore = create((set) => ({
  transfers: [],
  addTransfer: (transfer: any) =>
    set((state: any) => ({
      transfers: [...state.transfers, transfer],
    })),
}));