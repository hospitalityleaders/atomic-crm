import type { DataProvider, Identifier } from "ra-core";
import type { ConfigurationContextValue } from "../root/ConfigurationContext";
import type { Deal, Sale, SalesFormData, SignUpData } from "../types";

export type CrmDataProvider = DataProvider & {
  signUp(
    data: SignUpData,
  ): Promise<{ id: string; email: string; password: string }>;
  salesCreate(data: SalesFormData): Promise<Sale>;
  salesUpdate(id: Identifier, data: Partial<SalesFormData>): Promise<Sale>;
  updatePassword(id: Identifier): Promise<unknown>;
  archiveDeal?(deal: Deal): Promise<unknown>;
  unarchiveDeal(deal: Deal): Promise<unknown>;
  isInitialized(): Promise<boolean>;
  mergeContacts(sourceId: Identifier, targetId: Identifier): Promise<unknown>;
  getConfiguration(): Promise<ConfigurationContextValue>;
  updateConfiguration(
    config: ConfigurationContextValue,
  ): Promise<ConfigurationContextValue>;
};
