import type { AuthProvider } from "ra-core";
import { canAccess } from "../commons/canAccess";
import { api } from "./api";

export type HoledoSession = {
  userId: string;
  email: string;
  displayName: string;
  workspaceId: string;
  workspaceName: string;
  workspaceType: "personal" | "company";
  role: "owner" | "administrator" | "editor" | "viewer";
  platformAdmin: boolean;
  saleId: number;
};

let session: HoledoSession | undefined;

export async function getSession(refresh = false) {
  if (session && !refresh) return session;
  const response = await api<{ data: HoledoSession }>("/api/session");
  session = response.data;
  return session;
}

export const getAuthProvider = (): AuthProvider => ({
  login: async () => {
    window.location.assign(
      `/auth/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
    );
  },
  logout: async () => {
    session = undefined;
    window.location.assign("/auth/logout");
  },
  checkAuth: async () => {
    try {
      await getSession();
    } catch {
      throw { redirectTo: "/", message: false };
    }
  },
  checkError: async (error) => {
    if (error?.status === 401) {
      session = undefined;
      throw { redirectTo: "/", message: false };
    }
  },
  getIdentity: async () => {
    const current = await getSession();
    return {
      id: current.saleId,
      fullName: current.displayName,
      email: current.email,
      workspaceId: current.workspaceId,
      workspaceName: current.workspaceName,
      workspaceType: current.workspaceType,
      role: current.role,
    };
  },
  canAccess: async (params) => {
    const current = await getSession();
    const role = ["owner", "administrator"].includes(current.role)
      ? "admin"
      : "user";
    if (
      current.role === "viewer" &&
      ["create", "edit", "delete"].includes(params.action)
    )
      return false;
    return canAccess(role, params);
  },
});
