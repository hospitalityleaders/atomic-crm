export type RuntimeBranding = {
  accent_color?: string;
  footer_code?: string;
  head_code?: string;
  header_background_color?: string;
  header_text_color?: string;
  hero_background_color?: string;
  hero_height?: number;
  meta_description?: string;
  meta_title?: string;
  og_image_url?: string;
  site_icon_url?: string;
};

type BrandingOptions = {
  injectCode?: boolean;
};

function ensureMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    Object.entries(attributes).forEach(([name, value]) =>
      element?.setAttribute(name, value),
    );
    document.head.appendChild(element);
  }
  return element;
}

function ensureIcon(rel: string) {
  let element = document.head.querySelector<HTMLLinkElement>(
    `link[rel="${rel}"]`,
  );
  if (!element) {
    element = document.createElement("link");
    element.rel = rel;
    document.head.appendChild(element);
  }
  return element;
}

export function applyRuntimeBranding(
  runtime: RuntimeBranding,
  { injectCode = false }: BrandingOptions = {},
) {
  if (runtime.accent_color) {
    document.documentElement.style.setProperty(
      "--holedo-accent",
      runtime.accent_color,
    );
    document.documentElement.style.setProperty(
      "--primary",
      runtime.accent_color,
    );
    document.documentElement.style.setProperty("--ring", runtime.accent_color);
    document.documentElement.style.setProperty(
      "--sidebar-primary",
      runtime.accent_color,
    );
  }
  if (runtime.header_background_color) {
    document.documentElement.style.setProperty(
      "--holedo-header-background",
      runtime.header_background_color,
    );
  }
  if (runtime.header_text_color) {
    document.documentElement.style.setProperty(
      "--holedo-header-text",
      runtime.header_text_color,
    );
  }
  if (runtime.hero_background_color) {
    document.documentElement.style.setProperty(
      "--holedo-hero-background",
      runtime.hero_background_color,
    );
  }
  if (runtime.hero_height) {
    document.documentElement.style.setProperty(
      "--holedo-hero-height",
      `${runtime.hero_height}px`,
    );
  }

  if (runtime.meta_title) document.title = runtime.meta_title;
  if (runtime.meta_description !== undefined) {
    ensureMeta('meta[name="description"]', { name: "description" }).content =
      runtime.meta_description;
    ensureMeta('meta[property="og:description"]', {
      property: "og:description",
    }).content = runtime.meta_description;
    ensureMeta('meta[name="twitter:description"]', {
      name: "twitter:description",
    }).content = runtime.meta_description;
  }
  if (runtime.meta_title) {
    ensureMeta('meta[property="og:title"]', { property: "og:title" }).content =
      runtime.meta_title;
    ensureMeta('meta[name="twitter:title"]', {
      name: "twitter:title",
    }).content = runtime.meta_title;
  }

  if (runtime.site_icon_url) {
    const favicon = ensureIcon("icon");
    favicon.href = runtime.site_icon_url;
    favicon.removeAttribute("type");
    ensureIcon("apple-touch-icon").href = runtime.site_icon_url;
  }

  if (runtime.og_image_url) {
    ensureMeta('meta[property="og:image"]', { property: "og:image" }).content =
      runtime.og_image_url;
    ensureMeta('meta[name="twitter:image"]', {
      name: "twitter:image",
    }).content = runtime.og_image_url;
    ensureMeta('meta[name="twitter:card"]', { name: "twitter:card" }).content =
      "summary_large_image";
  }

  if (runtime.header_background_color) {
    ensureMeta('meta[name="theme-color"]', { name: "theme-color" }).content =
      runtime.header_background_color;
  }

  if (
    injectCode &&
    document.documentElement.dataset.holedoServerInjection !== "true"
  ) {
    replaceInjectedCode(document.head, "head", runtime.head_code ?? "");
    replaceInjectedCode(document.body, "footer", runtime.footer_code ?? "");
  }
}

function replaceInjectedCode(
  target: HTMLHeadElement | HTMLBodyElement,
  slot: "head" | "footer",
  markup: string,
) {
  target
    .querySelectorAll(`[data-holedo-code-injection="${slot}"]`)
    .forEach((element) => element.remove());
  if (!markup.trim()) return;

  const template = document.createElement("template");
  template.innerHTML = markup;
  template.content.querySelectorAll("script").forEach((script) => {
    const executable = document.createElement("script");
    for (const attribute of script.attributes) {
      executable.setAttribute(attribute.name, attribute.value);
    }
    executable.textContent = script.textContent;
    script.replaceWith(executable);
  });

  for (const node of [...template.content.childNodes]) {
    if (node instanceof Element) {
      node.setAttribute("data-holedo-code-injection", slot);
      target.appendChild(node);
    } else if (node.textContent?.trim()) {
      const wrapper = document.createElement(
        slot === "head" ? "template" : "span",
      );
      wrapper.dataset.holedoCodeInjection = slot;
      wrapper.textContent = node.textContent;
      target.appendChild(wrapper);
    }
  }
}
