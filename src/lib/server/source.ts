import type { Chain, IDataSource, RadarPayload, TapeEvent, TokenRow, HealthSource } from "@/lib/line/types";
import { listRadar } from "./radar";
import { getToken } from "./token";

export const dataSource: IDataSource = {
  listRadar(): Promise<RadarPayload> { return listRadar(); },
  getToken(chain: Chain, ca: string): Promise<TokenRow | null> { return getToken(chain, ca); },
  async listTape(): Promise<TapeEvent[]> { return []; },
  async health(): Promise<{ sources: HealthSource[]; hits: number; attempts: number }> {
    const r = await listRadar();
    return r.health;
  },
};
