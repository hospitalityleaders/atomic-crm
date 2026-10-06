import { describe, expect, it } from "vitest";

import { renderRuntimeHtml } from "./runtime-html.js";

const source = `<!doctype html>
<html lang="en">
  <head>
    <meta name="theme-color" content="#000000">
    <link rel="icon" href="/old.png">
    <link rel="apple-touch-icon" href="/old.png">
    <title>Old title</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

describe("renderRuntimeHtml", () => {
  it("renders runtime metadata and trusted code", () => {
    const html = renderRuntimeHtml(
      source,
      {
        meta_title: "Holedo & CRM",
        meta_description: 'Track "everything"',
        header_background_color: "#384677",
        site_icon_url: "/holedo.svg",
        og_image_url: "https://cdn.example/cover.png",
        head_code: '<script src="/cookie.js"></script>',
        footer_code: '<div id="notice">Cookies</div>',
      },
      true,
    );

    expect(html).toContain("Holedo &amp; CRM");
    expect(html).toContain("Track &quot;everything&quot;");
    expect(html).toContain('href="/holedo.svg"');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('data-holedo-server-injection="true"');
    expect(html).toContain('<script src="/cookie.js"></script>');
    expect(html).toContain('<div id="notice">Cookies</div>');
  });

  it("keeps the admin free of injected code", () => {
    const html = renderRuntimeHtml(
      source,
      {
        head_code: '<script src="/cookie.js"></script>',
        footer_code: '<div id="notice">Cookies</div>',
      },
      false,
    );

    expect(html).not.toContain("/cookie.js");
    expect(html).not.toContain('id="notice"');
    expect(html).not.toContain("data-holedo-server-injection");
  });
});
