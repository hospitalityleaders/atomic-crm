import {
  ArrowRight,
  Building2,
  Lock,
  MessagesSquare,
  UsersRound,
} from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { usePublicTheme } from "@/hooks/use-public-theme";
import { applyRuntimeBranding } from "@/runtime-branding";

type NavigationItem = {
  id?: number;
  label: string;
  url: string;
  sort_order: number;
  enabled: boolean;
};

type PublicRuntime = {
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
  authMode?: "demo" | "oidc" | "logged-out";
  loginUrl?: string;
  signupUrl?: string;
};

export const LoginPage = ({
  redirectTo = "/workspace",
}: {
  redirectTo?: string;
}) => {
  const { theme, setTheme } = usePublicTheme();
  const [runtime, setRuntime] = useState<PublicRuntime>({
    meta_title: "Holedo CRM",
    meta_description: "Track sales and customer conversations.",
    landing_headline: "Track sales and customer conversations",
    landing_subtitle:
      "Keep leads, deals and every customer conversation together in one clear workspace built for hospitality teams.",
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
    privacy_url: "https://www.iubenda.com/privacy-policy/84980546",
    cookie_url: "https://www.iubenda.com/privacy-policy/84980546/cookie-policy",
    terms_url: "https://www.iubenda.com/terms-and-conditions/84980546",
    imprint_url: "https://www.holedo.com/imprint/",
    privacy_settings_enabled: true,
    navigation: [
      {
        label: "Workspace",
        url: "https://office.holedo.com/",
        sort_order: 0,
        enabled: true,
      },
      {
        label: "Docs",
        url: "https://docs.holedo.com/",
        sort_order: 10,
        enabled: true,
      },
      {
        label: "Sheets",
        url: "https://sheets.holedo.com/",
        sort_order: 20,
        enabled: true,
      },
      {
        label: "Meet",
        url: "https://meet.holedo.com/",
        sort_order: 30,
        enabled: true,
      },
    ],
  });
  const returnTo = encodeURIComponent(redirectTo);
  const loginUrl =
    runtime.loginUrl || runtime.login_url || `/auth/login?returnTo=${returnTo}`;
  const signupUrl =
    runtime.signupUrl ||
    runtime.signup_url ||
    `/auth/login?returnTo=${returnTo}`;
  const heroButtonUrl = runtime.hero_button_url || signupUrl;
  useEffect(() => {
    fetch("/api/runtime")
      .then((response) => response.json())
      .then((data) => setRuntime((current) => ({ ...current, ...data })))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    applyRuntimeBranding(runtime);
  }, [runtime]);
  useEffect(() => {
    if (runtime.authMode !== "oidc") return;
    const controller = new AbortController();
    fetch("/api/session", { signal: controller.signal })
      .then((response) => {
        if (response.ok) window.location.replace(redirectTo);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [redirectTo, runtime.authMode]);
  useEffect(() => {
    if (!runtime.privacy_settings_enabled) return;
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-holedo-iubenda="true"]',
    );
    if (existing) return;
    const script = document.createElement("script");
    script.src = "https://cdn.iubenda.com/iubenda.js";
    script.async = true;
    script.dataset.holedoIubenda = "true";
    document.body.appendChild(script);
  }, [runtime.privacy_settings_enabled]);

  const navigation = runtime.navigation
    .filter((item) => item.enabled)
    .sort((a, b) => a.sort_order - b.sort_order);

  const isActiveNavigationItem = (url: string) => {
    try {
      const target = new URL(url, window.location.origin);
      return (
        target.hostname === window.location.hostname &&
        target.pathname.replace(/\/$/, "") ===
          window.location.pathname.replace(/\/$/, "")
      );
    } catch {
      return false;
    }
  };

  return (
    <main
      className="min-h-screen bg-[#f4f6f8] text-[#26324a] transition-colors dark:bg-[#15181f] dark:text-[#f5f7fb]"
      style={
        {
          "--holedo-accent": runtime.accent_color,
          "--holedo-header-text": runtime.header_text_color,
          "--holedo-hero-height": `${runtime.hero_height}px`,
        } as CSSProperties
      }
    >
      <header
        style={{
          backgroundColor: runtime.header_background_color,
          color: runtime.header_text_color,
        }}
      >
        <div className="flex h-11 items-stretch justify-between px-4 sm:px-5">
          <div className="flex min-w-0 items-stretch">
            <a href="/" className="flex w-14 shrink-0 items-center">
              <span className="sr-only">Holedo CRM</span>
              <img
                src="/assets/branding/1gc-holedo-icon-for-dark-bg.png"
                alt="Holedo"
                className="h-8 w-12 object-contain object-left"
              />
            </a>
            <nav className="flex min-w-0 items-stretch overflow-x-auto">
              {navigation.map((item) => {
                const active = isActiveNavigationItem(item.url);
                return (
                  <a
                    key={`${item.label}-${item.url}`}
                    href={item.url}
                    aria-current={active ? "page" : undefined}
                    className={`holedo-nav-link flex shrink-0 items-center border-b-2 px-3 text-[13px] font-semibold transition hover:opacity-100 ${
                      active
                        ? "border-[var(--holedo-accent)] text-white opacity-100"
                        : "border-transparent text-[var(--holedo-header-text)] opacity-70"
                    }`}
                  >
                    {item.label}
                  </a>
                );
              })}
            </nav>
          </div>
          <nav className="flex shrink-0 items-stretch gap-2 py-1">
            <a
              href={loginUrl}
              className="flex items-center gap-2 bg-[#202b55] px-4 text-[13px] font-semibold text-white hover:bg-[#172044]"
            >
              <Lock className="h-3.5 w-3.5" /> Login
            </a>
            <a
              href={signupUrl}
              className="flex items-center bg-[var(--holedo-accent)] px-4 text-[13px] font-semibold text-white transition hover:brightness-90"
            >
              Sign Up Free
            </a>
          </nav>
        </div>
      </header>

      <section
        className="relative overflow-hidden text-white lg:min-h-[var(--holedo-hero-height)]"
        data-holedo-hero
        style={{ backgroundColor: runtime.hero_background_color }}
      >
        <div className="relative mx-auto grid max-w-7xl gap-14 px-6 pb-16 pt-8 lg:min-h-[var(--holedo-hero-height)] lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:px-10 lg:py-10">
          <div className="max-w-3xl">
            <p className="mb-[5px] text-sm font-semibold uppercase text-[var(--holedo-accent)]">
              Holedo CRM
            </p>
            <h1 className="text-5xl font-bold leading-[1.06] tracking-tight sm:text-6xl">
              {runtime.landing_headline}
            </h1>
            <p className="mt-7 max-w-2xl text-xl leading-8 text-white/76">
              {runtime.landing_subtitle}
            </p>
            <div className="mt-10 flex flex-wrap">
              <a
                href={heroButtonUrl}
                className="inline-flex items-center gap-2 rounded-[2px] bg-[var(--holedo-accent)] px-6 py-3.5 font-semibold text-white shadow-lg shadow-black/10 transition hover:brightness-90"
              >
                {runtime.hero_button_text || "Start Now"}{" "}
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="rounded-[2px] border border-white/15 bg-white/10 p-5 shadow-2xl backdrop-blur-sm">
            <div className="rounded-[2px] bg-[#f3f5f9] p-5 text-[#26324a] dark:bg-[#20242d] dark:text-[#f5f7fb]">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-semibold">Sales pipeline</span>
                <span className="rounded-full bg-[#e9f7d7] px-3 py-1 text-xs font-semibold text-[#4f8410]">
                  12 active
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {["New lead", "Proposal", "Accepted"].map((stage, index) => (
                  <div
                    key={stage}
                    className="rounded-[2px] bg-white p-3 shadow-sm dark:bg-[#15181f]"
                  >
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#758099]">
                      {stage}
                    </p>
                    {[0, 1].slice(0, index === 2 ? 1 : 2).map((card) => (
                      <div
                        key={card}
                        className="mb-2 rounded-[2px] border border-[#e0e5ed] p-2 last:mb-0 dark:border-white/10"
                      >
                        <div className="h-2 w-4/5 rounded bg-[#cbd3df]" />
                        <div className="mt-2 h-2 w-1/2 rounded bg-[#e5e9ef]" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="mt-5 border-t-2 border-[#fd3732] pt-3 text-center text-xs font-semibold uppercase tracking-wider text-[#fd3732]">
                Archived deals stay in context
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-6 py-16 md:grid-cols-3 lg:px-10">
        {[
          [
            UsersRound,
            "Your own workspace",
            "Every Holedo member gets a private CRM workspace from their first sign-in.",
          ],
          [
            Building2,
            "One shared company",
            "Companies can work together in a shared workspace with clear member roles.",
          ],
          [
            MessagesSquare,
            "Conversation context",
            "Keep every note, task and deal stage connected to the relationship.",
          ],
        ].map(([Icon, title, copy]) => {
          const FeatureIcon = Icon as typeof UsersRound;
          return (
            <article
              key={String(title)}
              className="rounded-[2px] border border-[#e2e7ef] bg-white p-7 shadow-sm dark:border-white/10 dark:bg-[#20242d]"
            >
              <FeatureIcon className="mb-5 h-8 w-8 text-[var(--holedo-accent)]" />
              <h2 className="text-xl font-semibold">{String(title)}</h2>
              <p className="mt-3 leading-7 text-[#68748a] dark:text-[#a8b0bf]">
                {String(copy)}
              </p>
            </article>
          );
        })}
      </section>
      <footer className="border-t border-[#e2e7ef] px-6 py-8 text-center text-xs text-[#8b96a7] dark:border-white/10">
        <nav
          aria-label="Legal"
          className="holedo-legal-links flex flex-wrap items-center justify-center gap-x-[11px] gap-y-1"
        >
          <a
            href={runtime.privacy_url}
            className="iubenda-white no-brand iubenda-noiframe iubenda-embed"
            title="Privacy Policy"
          >
            Privacy
          </a>
          <span aria-hidden="true">·</span>
          <a
            href={runtime.cookie_url}
            className="iubenda-white no-brand iubenda-noiframe iubenda-embed"
            title="Cookie Policy"
          >
            Cookies
          </a>
          <span aria-hidden="true">·</span>
          <a
            href={runtime.terms_url}
            className="iubenda-white no-brand iubenda-noiframe iubenda-embed"
            title="Terms and Conditions"
          >
            Terms
          </a>
          <span aria-hidden="true">·</span>
          <a
            href={runtime.imprint_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Imprint
          </a>
          {runtime.privacy_settings_enabled ? (
            <>
              <span aria-hidden="true">·</span>
              <a href="#" className="iubenda-cs-preferences-link">
                Privacy settings
              </a>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() =>
              setTheme(
                theme === "light"
                  ? "dark"
                  : theme === "dark"
                    ? "system"
                    : "light",
              )
            }
            className="theme-toggle"
          >
            Theme:{" "}
            {theme === "system" ? "Auto" : theme === "dark" ? "Dark" : "Light"}
          </button>
        </nav>
      </footer>
    </main>
  );
};
