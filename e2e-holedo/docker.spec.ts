import { expect, test, type Browser, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Track sales and customer conversations",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Login", exact: true }).click();
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator("#kc-login").click();
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe("/workspace/deals");
  await expect(
    page.getByRole("button", { name: "Open account menu" }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/workspace/deals");
  await expect(page.getByRole("link", { name: "Get started" })).toHaveCount(0);
}

async function request(
  page: Page,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  return page.evaluate(
    async ({ path, options }) => {
      const response = await fetch(path, {
        method: options.method,
        headers: {
          ...(options.body === undefined
            ? {}
            : { "content-type": "application/json" }),
          ...options.headers,
        },
        body:
          options.body === undefined
            ? undefined
            : typeof options.body === "string"
              ? options.body
              : JSON.stringify(options.body),
      });
      return {
        status: response.status,
        body: await response.json().catch(() => null),
      };
    },
    { path, options },
  );
}

async function newSignedInPage(
  browser: Browser,
  email: string,
  password: string,
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, email, password);
  return { context, page };
}

test("Holedo public theme and token-only CRM admin work", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Track sales and customer conversations",
    }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Holedo CRM");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    /1gc-holedo-icon-for-dark-bg\.png/,
  );
  await expect(page.locator("header")).toHaveCSS("border-bottom-width", "0px");
  await expect(page.getByText("Holedo CRM", { exact: true }).last()).toHaveCSS(
    "letter-spacing",
    "normal",
  );
  await expect(page.locator("[data-holedo-hero]")).toHaveCSS(
    "background-color",
    "rgb(56, 70, 119)",
  );
  await expect(page.getByRole("link", { name: "Start Now" })).toHaveCSS(
    "border-radius",
    "2px",
  );
  await expect(page.getByRole("link", { name: "Start Now" })).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "Privacy", exact: true }),
  ).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.getByRole("link", { name: "Terms" })).toHaveClass(
    /iubenda-embed/,
  );
  await page.getByRole("button", { name: "Theme: Auto" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);

  await page.goto("/admin/");
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
  await page.getByLabel("Admin token").fill("local-holedo-admin-token");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(
    page.getByRole("heading", { name: "Runtime settings" }),
  ).toBeVisible();
  await expect(page.getByLabel("Homepage headline")).toHaveValue(
    "Track sales and customer conversations",
  );
  await expect(
    page.getByLabel("Header background colour hex value"),
  ).toHaveValue("#384677");
  await expect(page.getByLabel("Accent colour hex value")).toHaveValue(
    "#32a3fd",
  );
  await expect(page.getByLabel("Hero background colour hex value")).toHaveValue(
    "#384677",
  );
  await expect(page.getByLabel("Hero section height (px)")).toHaveValue("560");
  await expect(page.getByLabel("Site icon URL")).toHaveValue(
    "/assets/branding/1gc-holedo-icon-for-dark-bg.png",
  );
  await expect(page.getByLabel("Open Graph image URL")).toBeVisible();
  await expect(page.getByLabel("Hero button text")).toHaveValue("Start Now");
  await expect(page.getByLabel("Hero button URL")).toBeVisible();
  await expect(page.getByLabel("Login URL")).toBeVisible();
  await expect(page.getByLabel("Sign-up URL")).toBeVisible();
  await expect(page.getByLabel("Header code injection")).toBeVisible();
  await expect(page.getByLabel("Footer code injection")).toBeVisible();
});

test("Holedo identity, workspaces and storage work together", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const owner = await newSignedInPage(
    browser,
    "crm.owner@local.holedo.test",
    "local-holedo-owner",
  );

  try {
    const ownerSession = await request(owner.page, "/api/session");
    expect(ownerSession.status).toBe(200);
    expect(ownerSession.body.data.workspaceType).toBe("personal");
    expect(ownerSession.body.data.role).toBe("owner");
    expect(ownerSession.body.data.platformAdmin).toBe(true);

    const personalContact = await request(
      owner.page,
      "/api/resources/contacts",
      {
        method: "POST",
        body: { first_name: "Personal", last_name: "Only" },
      },
    );
    expect(personalContact.status).toBe(201);

    const personalInvitation = await request(
      owner.page,
      "/api/workspaces/current/members",
      {
        method: "POST",
        body: { email: "must-not-join@local.holedo.test", role: "editor" },
      },
    );
    expect(personalInvitation.status).toBe(403);
    expect(personalInvitation.body.error).toContain("Personal workspaces");

    await expect(owner.page.locator("header")).toBeVisible();
    await expect(owner.page.locator('header img[alt="Holedo"]')).toBeVisible();
    await expect(
      owner.page.getByRole("link", { name: "Dashboard" }),
    ).toHaveCount(0);
    await expect(owner.page.getByText("What's next?")).toHaveCount(0);
    await expect(owner.page.getByText("Install Atomic CRM")).toHaveCount(0);

    await owner.page.goto("/app");
    await expect
      .poll(() => new URL(owner.page.url()).pathname)
      .toBe("/app/deals");
    await expect(owner.page.locator("header")).toHaveCount(0);
    await expect(owner.page.getByText(/Deal bin/i)).toBeVisible();
    await owner.page.goto("/workspace");
    await expect
      .poll(() => new URL(owner.page.url()).pathname)
      .toBe("/workspace/deals");

    const runtime = await request(owner.page, "/api/admin/runtime");
    expect(runtime.status).toBe(200);

    const ownerWorkspaces = await request(owner.page, "/api/workspaces");
    let company = ownerWorkspaces.body.data.find(
      (workspace: { name: string }) =>
        workspace.name === "Holedo CI Hotel Group",
    );
    if (!company) {
      const createdCompany = await request(
        owner.page,
        "/api/workspaces/company",
        {
          method: "POST",
          body: { name: "Holedo CI Hotel Group" },
        },
      );
      expect(createdCompany.status).toBe(201);
      company = createdCompany.body.data;
    }

    const switchOwner = await request(owner.page, "/api/session/workspace", {
      method: "POST",
      body: { workspaceId: company.id },
    });
    expect(switchOwner.status).toBe(200);

    const companyContactsBeforeCreate = await request(
      owner.page,
      "/api/resources/contacts?perPage=1000",
    );
    expect(
      companyContactsBeforeCreate.body.data.some(
        (contact: { id: number }) =>
          contact.id === personalContact.body.data.id,
      ),
    ).toBe(false);

    const companyContact = await request(
      owner.page,
      "/api/resources/contacts",
      {
        method: "POST",
        body: { first_name: "Company", last_name: "Only" },
      },
    );
    expect(companyContact.status).toBe(201);

    const invitation = await request(
      owner.page,
      "/api/workspaces/current/members",
      {
        method: "POST",
        body: {
          email: "crm.colleague@local.holedo.test",
          role: "editor",
        },
      },
    );
    expect([201, 202]).toContain(invitation.status);

    const upload = await request(owner.page, "/api/files", {
      method: "POST",
      body: "Holedo CRM Docker storage test",
      headers: {
        "content-type": "text/plain",
        "x-file-name": "docker-smoke-test.txt",
      },
    });
    expect(upload.status).toBe(201);
    const download = await owner.page.evaluate(async (path) => {
      const response = await fetch(path);
      return { status: response.status, body: await response.text() };
    }, upload.body.data.src);
    expect(download).toEqual({
      status: 200,
      body: "Holedo CRM Docker storage test",
    });

    const colleague = await newSignedInPage(
      browser,
      "crm.colleague@local.holedo.test",
      "local-holedo-colleague",
    );
    try {
      const workspaces = await request(colleague.page, "/api/workspaces");
      const companyMembership = workspaces.body.data.find(
        (workspace: { name: string }) =>
          workspace.name === "Holedo CI Hotel Group",
      );
      expect(companyMembership.role).toBe("editor");

      const colleaguePersonalContacts = await request(
        colleague.page,
        "/api/resources/contacts?perPage=1000",
      );
      expect(
        colleaguePersonalContacts.body.data.some(
          (contact: { id: number }) =>
            contact.id === companyContact.body.data.id,
        ),
      ).toBe(false);

      const switchColleague = await request(
        colleague.page,
        "/api/session/workspace",
        {
          method: "POST",
          body: { workspaceId: companyMembership.id },
        },
      );
      expect(switchColleague.status).toBe(200);

      const colleagueSession = await request(colleague.page, "/api/session");
      expect(colleagueSession.body.data.workspaceType).toBe("company");
      expect(colleagueSession.body.data.role).toBe("editor");

      const colleagueCompanyContacts = await request(
        colleague.page,
        "/api/resources/contacts?perPage=1000",
      );
      expect(
        colleagueCompanyContacts.body.data.some(
          (contact: { id: number }) =>
            contact.id === companyContact.body.data.id,
        ),
      ).toBe(true);
      expect(
        colleagueCompanyContacts.body.data.some(
          (contact: { id: number }) =>
            contact.id === personalContact.body.data.id,
        ),
      ).toBe(false);

      const secondCompany = await request(
        colleague.page,
        "/api/workspaces/company",
        {
          method: "POST",
          body: { name: "A second company" },
        },
      );
      expect(secondCompany.status).toBe(409);
    } finally {
      await colleague.context.close();
    }

    await owner.page.getByRole("button", { name: "Open account menu" }).click();
    await owner.page
      .getByRole("menuitem", { name: "Sign out of Holedo" })
      .click();
    await expect.poll(() => new URL(owner.page.url()).pathname).toBe("/");

    await owner.page.goto("/auth/login?returnTo=%2Fworkspace");
    await expect(owner.page.locator('input[name="username"]')).toBeVisible();
  } finally {
    await owner.context.close();
  }
});
