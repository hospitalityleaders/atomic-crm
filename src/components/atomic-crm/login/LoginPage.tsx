import {
  ArrowRight,
  Building2,
  MessagesSquare,
  UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Notification } from "@/components/admin/notification";

type PublicRuntime = {
  landing_headline: string;
  landing_subtitle: string;
  privacy_url: string;
  terms_url: string;
  imprint_url: string;
};

export const LoginPage = ({ redirectTo = "/" }: { redirectTo?: string }) => {
  const returnTo = encodeURIComponent(redirectTo);
  const [runtime, setRuntime] = useState<PublicRuntime>({
    landing_headline: "Track sales and customer conversations",
    landing_subtitle:
      "Keep leads, deals and every customer conversation together in one clear workspace built for hospitality teams.",
    privacy_url: "https://www.iubenda.com/privacy-policy/84980546",
    terms_url: "https://www.iubenda.com/terms-and-conditions/84980546",
    imprint_url: "https://www.holedo.com/imprint/",
  });
  useEffect(() => {
    fetch("/api/runtime")
      .then((response) => response.json())
      .then((data) => setRuntime((current) => ({ ...current, ...data })))
      .catch(() => undefined);
  }, []);
  return (
    <main className="min-h-screen bg-white text-[#26324a]">
      <header className="border-b border-white/10 bg-[#384677] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <a href="/" className="flex items-center gap-3">
            <img
              src="/assets/branding/1gc-holedo-icon-for-dark-bg.png"
              alt="Holedo"
              className="h-9 w-9 object-contain"
            />
            <span className="text-xl font-semibold tracking-tight">
              Holedo CRM
            </span>
          </a>
          <nav className="flex items-center gap-3">
            <a
              href={`/auth/login?returnTo=${returnTo}`}
              className="rounded-md px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/10 hover:text-white"
            >
              Sign in
            </a>
            <a
              href={`/auth/register?returnTo=${returnTo}`}
              className="rounded-md bg-[#7dc81b] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#70b918]"
            >
              Get started
            </a>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[#384677] text-white">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_75%_30%,#32a3fd_0,transparent_38%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-14 px-6 py-20 lg:grid-cols-[1.05fr_.95fr] lg:px-10 lg:py-28">
          <div className="max-w-3xl">
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-[#7dc81b]">
              Holedo CRM
            </p>
            <h1 className="text-5xl font-bold leading-[1.06] tracking-tight sm:text-6xl">
              {runtime.landing_headline}
            </h1>
            <p className="mt-7 max-w-2xl text-xl leading-8 text-white/76">
              {runtime.landing_subtitle}
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <a
                href={`/auth/register?returnTo=${returnTo}`}
                className="inline-flex items-center gap-2 rounded-md bg-[#7dc81b] px-6 py-3.5 font-semibold text-white shadow-lg shadow-black/10 transition-colors hover:bg-[#70b918]"
              >
                Create your workspace <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href={`/auth/login?returnTo=${returnTo}`}
                className="rounded-md border border-white/30 px-6 py-3.5 font-semibold text-white hover:bg-white/10"
              >
                Sign in to CRM
              </a>
            </div>
          </div>

          <div className="rounded-xl border border-white/15 bg-white/10 p-5 shadow-2xl backdrop-blur-sm">
            <div className="rounded-lg bg-[#f3f5f9] p-5 text-[#26324a]">
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
                    className="rounded-md bg-white p-3 shadow-sm"
                  >
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#758099]">
                      {stage}
                    </p>
                    {[0, 1].slice(0, index === 2 ? 1 : 2).map((card) => (
                      <div
                        key={card}
                        className="mb-2 rounded border border-[#e0e5ed] p-2 last:mb-0"
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
              className="rounded-lg border border-[#e2e7ef] p-7 shadow-sm"
            >
              <FeatureIcon className="mb-5 h-8 w-8 text-[#32a3fd]" />
              <h2 className="text-xl font-semibold">{String(title)}</h2>
              <p className="mt-3 leading-7 text-[#68748a]">{String(copy)}</p>
            </article>
          );
        })}
      </section>
      <footer className="border-t border-[#e2e7ef] px-6 py-8 text-center text-sm text-[#68748a]">
        <div className="flex justify-center gap-6">
          <a href={runtime.privacy_url} className="hover:text-[#32a3fd]">
            Privacy
          </a>
          <a href={runtime.terms_url} className="hover:text-[#32a3fd]">
            Terms
          </a>
          <a href={runtime.imprint_url} className="hover:text-[#32a3fd]">
            Imprint
          </a>
        </div>
      </footer>
      <Notification />
    </main>
  );
};
