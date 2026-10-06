import { CRM } from "@/components/atomic-crm/root/CRM";
import { LoginPage } from "@/components/atomic-crm/login/LoginPage";
import { RuntimeAdminPage } from "@/components/atomic-crm/admin/RuntimeAdminPage";
import { EmbeddedLayout } from "@/components/atomic-crm/layout/EmbeddedLayout";
import { applyRuntimeBranding } from "@/runtime-branding";
import { useEffect } from "react";
import { BrowserRouter } from "react-router-dom";

/**
 * Application entry point
 *
 * Customize Atomic CRM by passing props to the CRM component:
 *  - companySectors
 *  - darkTheme
 *  - dealCategories
 *  - dealPipelineStatuses
 *  - dealStages
 *  - lightTheme
 *  - darkModeLogo / lightModeLogo
 *  - noteStatuses
 *  - taskTypes
 *  - title
 * ... as well as all the props accepted by shadcn-admin-kit's <Admin> component.
 *
 * Logos must be an imported asset, an absolute URL, or a data URI — never a
 * route-relative path like "./img/logo.png", which breaks on nested routes.
 *
 * @example
 * import logoDark from "./logo-dark.svg";
 * import logoLight from "./logo-light.svg";
 *
 * const App = () => (
 *    <CRM
 *       darkModeLogo={logoDark}
 *       lightModeLogo={logoLight}
 *       title="Acme CRM"
 *    />
 * );
 */
const App = () => {
  const isRuntimeAdmin =
    window.location.pathname === "/admin" ||
    window.location.pathname.startsWith("/admin/");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/runtime", { signal: controller.signal })
      .then((response) => response.json())
      .then((runtime) =>
        applyRuntimeBranding(runtime, { injectCode: !isRuntimeAdmin }),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [isRuntimeAdmin]);

  if (isRuntimeAdmin) {
    return <RuntimeAdminPage />;
  }
  const isEmbeddedApp =
    window.location.pathname === "/app" ||
    window.location.pathname.startsWith("/app/");
  const isWorkspace =
    window.location.pathname === "/workspace" ||
    window.location.pathname.startsWith("/workspace/");

  if (isEmbeddedApp) {
    return (
      <BrowserRouter basename="/app">
        <CRM layout={EmbeddedLayout} />
      </BrowserRouter>
    );
  }

  if (isWorkspace) {
    return (
      <BrowserRouter basename="/workspace">
        <CRM />
      </BrowserRouter>
    );
  }

  return <LoginPage redirectTo="/workspace" />;
};

export default App;
