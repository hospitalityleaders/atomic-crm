import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Moon, Sun } from "lucide-react";
import { usePublicTheme } from "@/hooks/use-public-theme";
import { applyRuntimeBranding } from "@/runtime-branding";

type NavigationItem = {
  id?: number;
  label: string;
  url: string;
  sort_order: number;
  enabled: boolean;
};

type RuntimeSettings = {
  meta_title: string;
  meta_description: string;
  landing_headline: string;
  landing_subtitle: string;
  header_background_color: string;
  header_text_color: string;
  hero_background_color: string;
  hero_height: number;
  accent_color: string;
  site_icon_url: string;
  og_image_url: string;
  login_url: string;
  signup_url: string;
  hero_button_text: string;
  hero_button_url: string;
  head_code: string;
  footer_code: string;
  privacy_url: string;
  cookie_url: string;
  terms_url: string;
  imprint_url: string;
  privacy_settings_enabled: boolean;
  navigation: NavigationItem[];
};

const emptySettings: RuntimeSettings = {
  meta_title: "Holedo CRM",
  meta_description: "Track sales and customer conversations.",
  landing_headline: "Track sales and customer conversations",
  landing_subtitle:
    "Keep leads, deals and every customer conversation together in one clear workspace.",
  header_background_color: "#384677",
  header_text_color: "#ffffff",
  hero_background_color: "#384677",
  hero_height: 560,
  accent_color: "#32a3fd",
  site_icon_url: "/assets/branding/1gc-holedo-icon-for-dark-bg.png",
  og_image_url: "",
  login_url: "",
  signup_url: "",
  hero_button_text: "Start Now",
  hero_button_url: "",
  head_code: "",
  footer_code: "",
  privacy_url: "",
  cookie_url: "",
  terms_url: "",
  imprint_url: "",
  privacy_settings_enabled: true,
  navigation: [],
};

export function RuntimeAdminPage() {
  const [settings, setSettings] = useState(emptySettings);
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Checking admin access");
  const { theme, setTheme } = usePublicTheme();

  async function loadSettings() {
    const response = await fetch("/api/admin/runtime", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? "Enter the admin token."
          : "Unable to load settings.",
      );
    const payload = (await response.json()) as { data: RuntimeSettings };
    setSettings(payload.data);
    setConnected(true);
    setStatus("");
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSettings().catch((error: Error) => setStatus(error.message));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    applyRuntimeBranding(settings);
  }, [settings]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setStatus("Signing in");
    const response = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ token }),
    });
    if (!response.ok) {
      setStatus(
        response.status === 503
          ? "Admin access is not configured."
          : "Invalid admin token.",
      );
      return;
    }
    setToken("");
    await loadSettings();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setStatus("Saving");
    const response = await fetch("/api/admin/runtime", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(settings),
    });
    if (!response.ok) {
      setStatus(
        response.status === 401
          ? "Your admin session has expired."
          : "Unable to save settings.",
      );
      if (response.status === 401) setConnected(false);
      return;
    }
    const payload = (await response.json()) as { data: RuntimeSettings };
    setSettings(payload.data);
    setStatus("Saved");
  }

  const updateNavigation = (index: number, patch: Partial<NavigationItem>) =>
    setSettings((current) => ({
      ...current,
      navigation: current.navigation.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));

  return (
    <main
      className="min-h-screen bg-[#f4f6f8] text-[#26324a] transition-colors dark:bg-[#15181f] dark:text-[#f5f7fb]"
      style={{ "--holedo-accent": settings.accent_color } as CSSProperties}
    >
      <AdminHeader
        theme={theme}
        setTheme={setTheme}
        backgroundColor={settings.header_background_color}
        textColor={settings.header_text_color}
      />
      {!connected ? (
        <section className="mx-auto max-w-4xl px-6 py-20">
          <div className="border border-[#e0e5ed] bg-white p-9 dark:border-white/10 dark:bg-[#20242d]">
            <p className="mb-[5px] text-sm font-bold uppercase text-[var(--holedo-accent)]">
              CRM administration
            </p>
            <h1 className="text-5xl font-bold tracking-tight">Admin</h1>
            <p className="mt-8 text-xl text-[#8b96a7]">
              Use the server-side admin token to manage CRM presentation
              settings.
            </p>
            <form className="mt-8" onSubmit={signIn}>
              <label
                className="block text-sm font-semibold"
                htmlFor="admin-token"
              >
                Admin token
              </label>
              <div className="mt-2 flex gap-3">
                <input
                  id="admin-token"
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  autoComplete="current-password"
                  className="min-h-12 flex-1 border border-[#d8dee8] bg-white px-4 text-foreground outline-none focus:border-[var(--holedo-accent)] dark:border-white/15 dark:bg-[#15181f]"
                />
                <button
                  className="bg-[var(--holedo-accent)] px-7 font-semibold text-white transition hover:brightness-90"
                  type="submit"
                >
                  Connect
                </button>
              </div>
            </form>
            <p
              className="mt-4 min-h-5 text-sm font-semibold text-[#7dc81b]"
              role="status"
            >
              {status}
            </p>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-7xl px-6 py-14">
          <div className="mb-8 flex items-end justify-between gap-5">
            <div>
              <p className="mb-[5px] text-sm font-bold uppercase text-[var(--holedo-accent)]">
                CRM administration
              </p>
              <h1 className="text-5xl font-bold tracking-tight">
                Runtime settings
              </h1>
              <p className="mt-5 text-xl text-[#8b96a7]">
                Changes apply without rebuilding the CRM image.
              </p>
            </div>
            <span className="font-semibold text-[#7dc81b]" role="status">
              {status}
            </span>
          </div>
          <form className="grid gap-5" onSubmit={save}>
            <AdminCard
              title="Navigation"
              copy="Items are displayed in order when enabled."
            >
              <div className="grid gap-3">
                {settings.navigation.map((item, index) => (
                  <div
                    className="grid gap-3 border-b border-border pb-4 md:grid-cols-[1fr_1.5fr_100px_auto_auto]"
                    key={`${item.id ?? "new"}-${index}`}
                  >
                    <AdminInput
                      label="Label"
                      value={item.label}
                      onChange={(value) =>
                        updateNavigation(index, { label: value })
                      }
                    />
                    <AdminInput
                      label="URL"
                      value={item.url}
                      onChange={(value) =>
                        updateNavigation(index, { url: value })
                      }
                    />
                    <AdminInput
                      label="Order"
                      type="number"
                      value={String(item.sort_order)}
                      onChange={(value) =>
                        updateNavigation(index, { sort_order: Number(value) })
                      }
                    />
                    <label className="flex items-end gap-2 pb-3 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={(event) =>
                          updateNavigation(index, {
                            enabled: event.target.checked,
                          })
                        }
                      />{" "}
                      Enabled
                    </label>
                    <button
                      className="self-end border border-border px-4 py-3 font-semibold"
                      type="button"
                      onClick={() =>
                        setSettings((current) => ({
                          ...current,
                          navigation: current.navigation.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  className="w-fit border border-border px-4 py-3 font-semibold"
                  type="button"
                  onClick={() =>
                    setSettings((current) => ({
                      ...current,
                      navigation: [
                        ...current.navigation,
                        {
                          label: "",
                          url: "/",
                          sort_order: current.navigation.length * 10,
                          enabled: true,
                        },
                      ],
                    }))
                  }
                >
                  Add menu item
                </button>
              </div>
            </AdminCard>
            <AdminCard
              title="Colours"
              copy="Set the navigation bar, homepage hero and shared Holedo accent colours."
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <AdminColorInput
                  label="Header background colour"
                  value={settings.header_background_color}
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      header_background_color: value,
                    }))
                  }
                />
                <AdminColorInput
                  label="Header font colour"
                  value={settings.header_text_color}
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      header_text_color: value,
                    }))
                  }
                />
                <AdminColorInput
                  label="Hero background colour"
                  value={settings.hero_background_color}
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      hero_background_color: value,
                    }))
                  }
                />
                <AdminColorInput
                  label="Accent colour"
                  value={settings.accent_color}
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      accent_color: value,
                    }))
                  }
                />
              </div>
            </AdminCard>
            <AdminCard
              title="Branding, SEO and sharing"
              copy="Set the browser icon and the information used by search engines and social previews."
            >
              <div className="grid gap-4">
                <AdminImageUrl
                  label="Site icon URL"
                  value={settings.site_icon_url}
                  previewAlt="Configured site icon"
                  compact
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      site_icon_url: value,
                    }))
                  }
                />
                <AdminInput
                  label="Meta title"
                  value={settings.meta_title}
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      meta_title: value,
                    }))
                  }
                />
                <AdminInput
                  label="Meta description"
                  value={settings.meta_description}
                  multiline
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      meta_description: value,
                    }))
                  }
                />
                <AdminImageUrl
                  label="Open Graph image URL"
                  value={settings.og_image_url}
                  previewAlt="Configured Open Graph image"
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      og_image_url: value,
                    }))
                  }
                />
              </div>
            </AdminCard>
            <AdminCard
              title="Homepage"
              copy="Control the logged-out product page and its single call to action."
            >
              <div className="grid gap-4">
                <AdminInput
                  label="Homepage headline"
                  value={settings.landing_headline}
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      landing_headline: value,
                    }))
                  }
                />
                <AdminInput
                  label="Homepage subtitle"
                  value={settings.landing_subtitle}
                  multiline
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      landing_subtitle: value,
                    }))
                  }
                />
                <AdminInput
                  label="Hero section height (px)"
                  type="number"
                  min={360}
                  max={1200}
                  value={String(settings.hero_height)}
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      hero_height: Number(value),
                    }))
                  }
                />
                <p className="text-sm text-[#8b96a7]">
                  Sets the minimum height on desktop. On smaller screens the
                  hero expands to fit its content.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <AdminInput
                    label="Hero button text"
                    value={settings.hero_button_text}
                    onChange={(value) =>
                      setSettings((current) => ({
                        ...current,
                        hero_button_text: value,
                      }))
                    }
                  />
                  <AdminInput
                    label="Hero button URL"
                    value={settings.hero_button_url}
                    onChange={(value) =>
                      setSettings((current) => ({
                        ...current,
                        hero_button_url: value,
                      }))
                    }
                  />
                </div>
              </div>
            </AdminCard>
            <AdminCard
              title="Access and account buttons"
              copy="Set the destinations used by Login and Sign Up Free in the public header."
            >
              <div className="grid gap-4">
                <AdminInput
                  label="Login URL"
                  value={settings.login_url}
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      login_url: value,
                    }))
                  }
                />
                <AdminInput
                  label="Sign-up URL"
                  value={settings.signup_url}
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      signup_url: value,
                    }))
                  }
                />
              </div>
            </AdminCard>
            <AdminCard
              title="Code injection"
              copy="Add trusted site-wide code without rebuilding. Injected code runs on the public page, browser workspace and embedded app, but never in this admin."
            >
              <div className="grid gap-4">
                <AdminInput
                  label="Header code injection"
                  value={settings.head_code}
                  multiline
                  code
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      head_code: value,
                    }))
                  }
                />
                <AdminInput
                  label="Footer code injection"
                  value={settings.footer_code}
                  multiline
                  code
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      footer_code: value,
                    }))
                  }
                />
                <p className="text-sm font-semibold text-[#fd3732]">
                  Only paste code you trust. Injected scripts can read and
                  change anything displayed by the CRM.
                </p>
              </div>
            </AdminCard>
            <AdminCard title="Legal" copy="Links shown in the CRM footer.">
              <div className="grid gap-4">
                {(
                  [
                    "privacy_url",
                    "cookie_url",
                    "terms_url",
                    "imprint_url",
                  ] as const
                ).map((key) => (
                  <AdminInput
                    key={key}
                    label={key.replaceAll("_", " ")}
                    value={settings[key]}
                    onChange={(value) =>
                      setSettings((current) => ({ ...current, [key]: value }))
                    }
                  />
                ))}
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={settings.privacy_settings_enabled}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        privacy_settings_enabled: event.target.checked,
                      }))
                    }
                  />
                  Show privacy settings in the footer
                </label>
              </div>
            </AdminCard>
            <div className="flex justify-end gap-3">
              <a
                className="border border-border px-5 py-3 font-semibold"
                href="/"
              >
                View CRM
              </a>
              <button
                className="bg-[var(--holedo-accent)] px-6 py-3 font-semibold text-white transition hover:brightness-90"
                type="submit"
              >
                Save settings
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}

function AdminHeader({
  theme,
  setTheme,
  backgroundColor,
  textColor,
}: ReturnType<typeof usePublicTheme> & {
  backgroundColor: string;
  textColor: string;
}) {
  return (
    <header style={{ backgroundColor, color: textColor }}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <a className="flex items-center gap-4" href="/">
          <img
            className="h-10 w-10 object-contain"
            src="/assets/branding/1gc-holedo-icon-for-dark-bg.png"
            alt="Holedo"
          />
          <span className="text-lg font-semibold">CRM</span>
        </a>
        <button
          className="flex items-center gap-2 px-3 py-2 text-sm font-semibold"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          type="button"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
          Theme: {theme === "dark" ? "Dark" : "Light"}
        </button>
      </div>
    </header>
  );
}

function AdminImageUrl({
  label,
  value,
  previewAlt,
  compact = false,
  onChange,
}: {
  label: string;
  value: string;
  previewAlt: string;
  compact?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 border border-[#d8dee8] p-3 dark:border-white/15 sm:grid-cols-[auto_1fr] sm:items-center">
      <div
        className={`flex items-center justify-center bg-[#f4f6f8] dark:bg-[#15181f] ${
          compact ? "h-16 w-16" : "aspect-[1.91/1] w-full sm:w-48"
        }`}
      >
        {value ? (
          <img
            alt={previewAlt}
            className="max-h-full max-w-full object-contain"
            src={value}
          />
        ) : (
          <span className="px-3 text-center text-xs text-[#8b96a7]">
            No image configured
          </span>
        )}
      </div>
      <AdminInput label={label} value={value} onChange={onChange} />
    </div>
  );
}

function AdminCard({
  title,
  copy,
  children,
}: {
  title: string;
  copy: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-8 border border-[#e0e5ed] bg-white p-7 dark:border-white/10 dark:bg-[#20242d] lg:grid-cols-[.65fr_1.35fr]">
      <div>
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-3 text-[#8b96a7]">{copy}</p>
      </div>
      {children}
    </section>
  );
}

function AdminInput({
  label,
  value,
  type = "text",
  multiline = false,
  code = false,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  multiline?: boolean;
  code?: boolean;
  min?: number;
  max?: number;
  onChange: (value: string) => void;
}) {
  const className = `min-h-11 w-full border border-[#d8dee8] bg-white px-3 py-2 text-foreground outline-none focus:border-[var(--holedo-accent)] dark:border-white/15 dark:bg-[#15181f] ${
    code ? "font-mono text-xs" : ""
  }`;
  return (
    <label className="grid gap-1.5 text-sm font-semibold capitalize">
      {label}
      {multiline ? (
        <textarea
          className={className}
          rows={3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={className}
          min={min}
          max={max}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function AdminColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      {label}
      <span className="flex min-h-11 items-center gap-3 border border-[#d8dee8] bg-white px-3 dark:border-white/15 dark:bg-[#15181f]">
        <input
          aria-label={`${label} picker`}
          className="h-7 w-9 cursor-pointer border-0 bg-transparent p-0"
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          aria-label={`${label} hex value`}
          className="min-w-0 flex-1 bg-transparent font-mono uppercase outline-none"
          maxLength={7}
          pattern="#[0-9a-fA-F]{6}"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}
