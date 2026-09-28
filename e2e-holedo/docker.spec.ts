import { expect, test, type Browser, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Track sales and customer conversations",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator("#kc-login").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/app");
  await expect(
    page.getByRole("button", { name: "Open account menu" }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/app");
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

    await owner.page.goto("/auth/login?returnTo=%2Fapp");
    await expect(owner.page.locator('input[name="username"]')).toBeVisible();
  } finally {
    await owner.context.close();
  }
});
