import { afterEach, describe, expect, it } from "vitest";

import { applyRuntimeBranding } from "./runtime-branding";

const injectedWindow = window as typeof window & {
  __holedoInjectionTest?: number;
};

afterEach(() => {
  document
    .querySelectorAll("[data-holedo-code-injection]")
    .forEach((element) => element.remove());
  delete injectedWindow.__holedoInjectionTest;
});

describe("applyRuntimeBranding", () => {
  it("applies separate navigation and hero presentation variables", () => {
    applyRuntimeBranding({
      header_background_color: "#384677",
      header_text_color: "#aeb7cf",
      hero_background_color: "#26324a",
      hero_height: 640,
    });

    expect(
      document.documentElement.style.getPropertyValue(
        "--holedo-header-background",
      ),
    ).toBe("#384677");
    expect(
      document.documentElement.style.getPropertyValue("--holedo-header-text"),
    ).toBe("#aeb7cf");
    expect(
      document.documentElement.style.getPropertyValue(
        "--holedo-hero-background",
      ),
    ).toBe("#26324a");
    expect(
      document.documentElement.style.getPropertyValue("--holedo-hero-height"),
    ).toBe("640px");
  });

  it("does not execute code injection unless explicitly enabled", () => {
    applyRuntimeBranding({
      head_code: "<script>window.__holedoInjectionTest = 1</" + "script>",
    });

    expect(injectedWindow.__holedoInjectionTest).toBeUndefined();
  });

  it("injects trusted head and footer code and replaces earlier snippets", () => {
    applyRuntimeBranding(
      {
        head_code:
          '<meta name="holedo-test" content="first"><script>window.__holedoInjectionTest = 1</' +
          "script>",
        footer_code: '<div id="holedo-footer-test">Footer notice</div>',
      },
      { injectCode: true },
    );

    expect(
      document.head
        .querySelector('meta[name="holedo-test"]')
        ?.getAttribute("content"),
    ).toBe("first");
    expect(
      document.body.querySelector("#holedo-footer-test")?.textContent,
    ).toBe("Footer notice");
    expect(injectedWindow.__holedoInjectionTest).toBe(1);

    applyRuntimeBranding(
      { head_code: '<meta name="holedo-test" content="second">' },
      { injectCode: true },
    );

    expect(
      document.head.querySelectorAll('meta[name="holedo-test"]'),
    ).toHaveLength(1);
    expect(
      document.head
        .querySelector('meta[name="holedo-test"]')
        ?.getAttribute("content"),
    ).toBe("second");
    expect(document.body.querySelector("#holedo-footer-test")).toBeNull();
  });
});
