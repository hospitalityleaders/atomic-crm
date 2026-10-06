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
