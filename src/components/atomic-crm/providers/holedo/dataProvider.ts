import type {
  DataProvider,
  GetListParams,
  GetManyReferenceParams,
  Identifier,
  RaRecord,
} from "ra-core";
import type { Deal, RAFile, SalesFormData, SignUpData } from "../../types";
import type { ConfigurationContextValue } from "../../root/ConfigurationContext";
import { mergeContacts } from "../commons/mergeContacts";
import { api } from "./api";

function resourceUrl(resource: string, id?: Identifier) {
  return `/api/resources/${encodeURIComponent(resource)}${id == null ? "" : `/${encodeURIComponent(id)}`}`;
}

async function upload(file: RAFile) {
  if (!(file?.rawFile instanceof File)) return file;
  const response = await api<{ data: RAFile }>("/api/files", {
    method: "POST",
    headers: {
      "content-type": file.rawFile.type || "application/octet-stream",
      "x-file-name": encodeURIComponent(file.rawFile.name),
    },
    body: file.rawFile,
  });
  return { ...file, ...response.data, rawFile: undefined };
}

async function prepareData(resource: string, source: Record<string, any>) {
  const data = { ...source };
  if (resource === "companies" && data.logo)
    data.logo = await upload(data.logo);
  if (resource === "sales" && data.avatar)
    data.avatar = await upload(data.avatar);
  if (
    ["contact_notes", "deal_notes"].includes(resource) &&
    Array.isArray(data.attachments)
  ) {
    data.attachments = await Promise.all(data.attachments.map(upload));
  }
  if (resource === "configuration" && data.config) {
    data.config = { ...data.config };
    if (typeof data.config.lightModeLogo !== "string")
      data.config.lightModeLogo = (await upload(data.config.lightModeLogo)).src;
    if (typeof data.config.darkModeLogo !== "string")
      data.config.darkModeLogo = (await upload(data.config.darkModeLogo)).src;
  }
  return data;
}

const baseProvider: DataProvider = {
  getList: async <RecordType extends RaRecord = RaRecord>(
    resource: string,
    params: GetListParams,
  ) => {
    const query = new URLSearchParams({
      page: String(params.pagination?.page ?? 1),
      perPage: String(params.pagination?.perPage ?? 25),
      sort: params.sort?.field ?? "id",
      order: params.sort?.order ?? "ASC",
      filter: JSON.stringify(params.filter ?? {}),
    });
    const result = await api<{ data: RaRecord[]; total: number }>(
      `${resourceUrl(resource)}?${query}`,
    );
    if (resource === "activity_log") {
      result.data = result.data.map((row: any) => ({
        ...row,
        contactNote: row.contact_note ?? undefined,
        dealNote: row.deal_note ?? undefined,
      }));
    }
    return result as { data: RecordType[]; total: number };
  },
  getOne: (resource, params) => api(resourceUrl(resource, params.id)),
  getMany: async (resource, params) => {
    const result = await baseProvider.getList(resource, {
      pagination: { page: 1, perPage: Math.max(params.ids.length, 1) },
      sort: { field: "id", order: "ASC" },
      filter: { "id@in": params.ids },
    });
    return { data: result.data };
  },
  getManyReference: async (resource, params: GetManyReferenceParams) => {
    return baseProvider.getList(resource, {
      ...params,
      filter: { ...params.filter, [params.target]: params.id },
    });
  },
  create: async (resource, params) =>
    api(resourceUrl(resource), {
      method: "POST",
      body: JSON.stringify(await prepareData(resource, params.data)),
    }),
  update: async (resource, params) =>
    api(resourceUrl(resource, params.id), {
      method: "PUT",
      body: JSON.stringify(await prepareData(resource, params.data)),
    }),
  updateMany: async (resource, params) => {
    await Promise.all(
      params.ids.map((id) =>
        baseProvider.update(resource, {
          id,
          data: params.data,
          previousData: { id } as any,
        }),
      ),
    );
    return { data: params.ids };
  },
  delete: (resource, params) =>
    api(resourceUrl(resource, params.id), { method: "DELETE" }),
  deleteMany: async (resource, params) => {
    await Promise.all(
      params.ids.map((id) =>
        baseProvider.delete(resource, { id, previousData: { id } as any }),
      ),
    );
    return { data: params.ids };
  },
};

export const getDataProvider = () => {
  const provider = {
    ...baseProvider,
    async signUp(data: SignUpData) {
      window.location.assign("/auth/register");
      return { id: "keycloak", email: data.email, password: data.password };
    },
    async salesCreate(data: SalesFormData) {
      const response = await api<{ data: any }>(
        "/api/workspaces/current/members",
        {
          method: "POST",
          body: JSON.stringify({
            email: data.email,
            role: data.administrator ? "administrator" : "editor",
          }),
        },
      );
      return response.data;
    },
    async salesUpdate(id: Identifier, data: Partial<SalesFormData>) {
      const response = await baseProvider.update("sales", {
        id,
        data,
        previousData: {},
      });
      return response.data;
    },
    async updatePassword(_id: Identifier) {
      window.location.assign("/auth/account");
      return true;
    },
    async archiveDeal(deal: Deal) {
      return api<{ data: Deal }>(`/api/deals/${deal.id}/archive`, {
        method: "POST",
      });
    },
    async unarchiveDeal(deal: Deal) {
      return api<{ data: Deal }>(`/api/deals/${deal.id}/restore`, {
        method: "POST",
      });
    },
    async isInitialized() {
      return true;
    },
    async mergeContacts(sourceId: Identifier, targetId: Identifier) {
      return mergeContacts(sourceId, targetId, provider);
    },
    async getConfiguration(): Promise<ConfigurationContextValue> {
      const { data } = await baseProvider.getOne("configuration", { id: 1 });
      return (data.config as ConfigurationContextValue) ?? {};
    },
    async updateConfiguration(config: ConfigurationContextValue) {
      const { data } = await baseProvider.update("configuration", {
        id: 1,
        data: { config },
        previousData: { id: 1 },
      });
      return data.config as ConfigurationContextValue;
    },
  };
  return provider;
};

export type CrmDataProvider = ReturnType<typeof getDataProvider>;
