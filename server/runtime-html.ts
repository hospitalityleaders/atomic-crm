export type RuntimeHtmlSettings = {
  footer_code?: string;
  head_code?: string;
  header_background_color?: string;
  meta_description?: string;
  meta_title?: string;
  og_image_url?: string;
  site_icon_url?: string;
};

const escapeAttribute = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const escapeText = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export function renderRuntimeHtml(
  source: string,
  settings: RuntimeHtmlSettings,
  injectCode: boolean,
) {
  const title = settings.meta_title || "Holedo CRM";
  const description = settings.meta_description || "";
  const icon =
    settings.site_icon_url ||
    "/assets/branding/1gc-holedo-icon-for-dark-bg.png";
  const themeColor = settings.header_background_color || "#384677";
  const socialTags = [
    `<meta name="description" content="${escapeAttribute(description)}">`,
    `<meta property="og:title" content="${escapeAttribute(title)}">`,
    `<meta property="og:description" content="${escapeAttribute(description)}">`,
    '<meta property="og:type" content="website">',
    `<meta name="twitter:title" content="${escapeAttribute(title)}">`,
    `<meta name="twitter:description" content="${escapeAttribute(description)}">`,
    ...(settings.og_image_url
      ? [
          `<meta property="og:image" content="${escapeAttribute(settings.og_image_url)}">`,
          `<meta name="twitter:image" content="${escapeAttribute(settings.og_image_url)}">`,
          '<meta name="twitter:card" content="summary_large_image">',
        ]
      : []),
  ].join("\n");

  let html = source
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeText(title)}</title>`)
    .replace(
      /<meta\s+name="theme-color"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="theme-color" content="${escapeAttribute(themeColor)}">`,
    )
    .replace(
      /<link\s+rel="icon"[\s\S]*?\/?>/i,
      `<link rel="icon" href="${escapeAttribute(icon)}">`,
    )
    .replace(
      /<link\s+rel="apple-touch-icon"[\s\S]*?\/?>/i,
      `<link rel="apple-touch-icon" href="${escapeAttribute(icon)}">`,
    );

  if (injectCode) {
    html = html.replace(
      /<html([^>]*)>/i,
      '<html$1 data-holedo-server-injection="true">',
    );
  }
  html = html.replace(
    "</head>",
    `${socialTags}\n${injectCode ? settings.head_code || "" : ""}\n</head>`,
  );
  if (injectCode && settings.footer_code) {
    html = html.replace("</body>", `${settings.footer_code}\n</body>`);
  }
  return html;
}
