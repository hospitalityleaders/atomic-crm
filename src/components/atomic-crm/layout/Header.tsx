import { FileText, Import, Settings, User, Users } from "lucide-react";
import { CanAccess, useTranslate, useUserMenu } from "ra-core";
import { Link, matchPath, useLocation } from "react-router";
import { useEffect, useState } from "react";
import { RefreshButton } from "@/components/admin/refresh-button";
import { ThemeModeToggle } from "@/components/admin/theme-mode-toggle";
import { UserMenu } from "@/components/admin/user-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { ImportPage } from "../misc/ImportPage";
import { ChangelogPage } from "../misc/ChangelogPage";
import { api } from "../providers/holedo/api";

type WorkspaceOption = {
  id: string;
  name: string;
  workspace_type: "personal" | "company";
  active: boolean;
};

const Header = () => {
  const { title } = useConfigurationContext();
  const location = useLocation();
  const translate = useTranslate();

  let currentPath: string | boolean;
  if (matchPath("/contacts/*", location.pathname)) {
    currentPath = "/contacts";
  } else if (matchPath("/companies/*", location.pathname)) {
    currentPath = "/companies";
  } else if (matchPath("/deals/*", location.pathname)) {
    currentPath = "/deals";
  } else {
    currentPath = false;
  }

  return (
    <>
      <nav className="grow">
        <header
          className="shadow-sm"
          style={{
            backgroundColor: "var(--holedo-header-background, #384677)",
            color: "var(--holedo-header-text, #ffffff)",
          }}
        >
          <div className="px-5">
            <div className="flex justify-between items-center flex-1">
              <Link
                to="/"
                className="flex w-14 shrink-0 items-center no-underline"
              >
                <span className="sr-only">{title}</span>
                <img
                  className="h-8 w-12 object-contain object-left"
                  src="/assets/branding/1gc-holedo-icon-for-dark-bg.png"
                  alt="Holedo"
                />
              </Link>
              <div>
                <nav className="flex">
                  <NavigationTab
                    label={translate("resources.contacts.name", {
                      smart_count: 2,
                    })}
                    to="/contacts"
                    isActive={currentPath === "/contacts"}
                  />
                  <NavigationTab
                    label={translate("resources.companies.name", {
                      smart_count: 2,
                    })}
                    to="/companies"
                    isActive={currentPath === "/companies"}
                  />
                  <NavigationTab
                    label={translate("resources.deals.name", {
                      smart_count: 2,
                    })}
                    to="/deals"
                    isActive={currentPath === "/deals"}
                  />
                </nav>
              </div>
              <div className="flex items-center gap-1">
                <WorkspaceSwitcher />
                <ThemeModeToggle />
                <RefreshButton />
                <UserMenu logoutHref="/auth/logout">
                  <ProfileMenu />
                  <CanAccess resource="sales" action="list">
                    <UsersMenu />
                  </CanAccess>
                  <CanAccess resource="configuration" action="edit">
                    <SettingsMenu />
                  </CanAccess>
                  <ImportFromJsonMenuItem />
                  <ChangelogMenuItem />
                </UserMenu>
              </div>
            </div>
          </div>
        </header>
      </nav>
    </>
  );
};

const NavigationTab = ({
  label,
  to,
  isActive,
}: {
  label: string;
  to: string;
  isActive: boolean;
}) => (
  <Link
    to={to}
    className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 text-[var(--holedo-header-text,#ffffff)] ${
      isActive
        ? "border-[var(--holedo-accent)] opacity-100"
        : "border-transparent opacity-70 hover:opacity-90"
    }`}
  >
    {label}
  </Link>
);

const WorkspaceSwitcher = () => {
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  useEffect(() => {
    api<{ data: WorkspaceOption[] }>("/api/workspaces")
      .then((result) => setWorkspaces(result.data))
      .catch(() => setWorkspaces([]));
  }, []);
  const active = workspaces.find((workspace) => workspace.active);
  if (!active) return null;
  return (
    <select
      aria-label="Current CRM workspace"
      value={active.id}
      onChange={async (event) => {
        await api("/api/session/workspace", {
          method: "POST",
          body: JSON.stringify({ workspaceId: event.target.value }),
        });
        window.localStorage.removeItem("RaStore.auth.current_sale");
        window.location.reload();
      }}
      className="mr-2 max-w-48 rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white outline-none hover:bg-white/15"
    >
      {workspaces.map((workspace) => (
        <option
          key={workspace.id}
          value={workspace.id}
          className="text-[#26324a]"
        >
          {workspace.name}
          {workspace.workspace_type === "personal"
            ? " · Personal"
            : " · Company"}
        </option>
      ))}
    </select>
  );
};

const UsersMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<UsersMenu> must be used inside <UserMenu?");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/sales" className="flex items-center gap-2">
        <Users />
        {translate("resources.sales.name", { smart_count: 2 })}
      </Link>
    </DropdownMenuItem>
  );
};

const ProfileMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ProfileMenu> must be used inside <UserMenu?");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/profile" className="flex items-center gap-2">
        <User />
        {translate("crm.profile.title")}
      </Link>
    </DropdownMenuItem>
  );
};

const SettingsMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<SettingsMenu> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/settings" className="flex items-center gap-2">
        <Settings />
        {translate("crm.settings.title")}
      </Link>
    </DropdownMenuItem>
  );
};

const ImportFromJsonMenuItem = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ImportFromJsonMenuItem> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to={ImportPage.path} className="flex items-center gap-2">
        <Import />
        {translate("crm.header.import_data")}
      </Link>
    </DropdownMenuItem>
  );
};

const ChangelogMenuItem = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ChangelogMenuItem> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to={ChangelogPage.path} className="flex items-center gap-2">
        <FileText />
        {translate("crm.changelog.title")}
      </Link>
    </DropdownMenuItem>
  );
};
export default Header;
