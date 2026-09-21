import { expect, test, type Page, type Route } from "playwright/test";
import type { ChatDetail, ChatTurn } from "../../app/lib/chat-types";
import type { SettingsPayload } from "../../app/lib/settings-types";
import type { TranslationResponse } from "../../app/lib/translation-schema";

function translation(text = "First line\nSecond line\n\nThird paragraph"): TranslationResponse {
  return {
    detectedSourceLanguage: "en",
    confidence: 1,
    translations: [
      { text, sourceEquivalent: "Hello", romanization: null, keyWords: [] },
      { text: "Another translation", sourceEquivalent: "Hello", romanization: null, keyWords: [] },
    ],
    keyWords: [],
  };
}

function chat(id: string): ChatDetail {
  const turn: ChatTurn = {
    id: `${id}-turn`, chatId: id, text: "Hello", sourceLang: "en", targetLang: "es",
    result: translation(), selectedOption: 0, parentId: null,
    createdAt: "2026-09-21T00:00:00Z", branchIndex: 0, branchCount: 2,
    siblingIds: [`${id}-turn`, `${id}-alternative`],
  };
  return {
    id, title: `Chat ${id.toUpperCase()}`, sourceLang: "en", targetLang: "es", notes: null,
    createdAt: turn.createdAt, updatedAt: turn.createdAt, turns: [turn], totalTurns: 1,
  };
}

const settings: SettingsPayload = {
  defaultSystemPrompt: "Translate",
  settings: {
    version: "0.2.3", locale: "en", user: { model: null, systemPrompt: null }, instance: null,
    effective: { provider: "openai-compatible", model: "test", baseUrl: "http://example.invalid", hasApiKey: false },
    speech: {
      user: { engine: null }, instance: null,
      effective: { engine: "browser", sttModel: "test", ttsModel: "test", ttsVoice: "test", providerConfigured: false },
    },
  },
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function openApp(page: Page) {
  const chats = new Map(["a", "b", "c"].map((id) => [id, chat(id)]));
  const sent: Record<string, unknown>[] = [];
  let previews = 0;

  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let json: unknown;
    if (path === "/api/auth/me") {
      json = { user: { id: "test-user", username: "test", role: "user" } };
    } else if (path === "/api/settings") {
      json = settings;
    } else if (path === "/api/keys") {
      json = { keys: [] };
    } else if (path === "/api/chats") {
      json = { chats: [...chats.values()] };
    } else if (path === "/api/translate") {
      json = translation(`Preview ${++previews}`);
    } else {
      const match = path.match(/^\/api\/chats\/([^/]+)(?:\/turns(?:\/([^/]+))?)?$/);
      const current = match && chats.get(match[1]);
      if (!current) {
        throw new Error(`Unexpected request: ${request.method()} ${path}`);
      }
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        sent.push(body);
        current.turns.push({ ...current.turns[0], id: "new-turn", text: body.text, result: body.result ?? translation() });
        current.totalTurns += 1;
      } else if (request.method() === "PATCH") {
        const body = request.postDataJSON();
        if (body.action === "setNotes") current.notes = body.notes;
        if (body.action === "rename") current.title = body.title;
        if (body.action === "switchBranch") {
          current.turns = [{ ...current.turns[0], id: match![2], branchIndex: 1 }];
        }
        if (body.selectedOption !== undefined) current.turns[0].selectedOption = body.selectedOption;
      }
      json = { chat: current };
    }
    await route.fulfill({ json });
  });
  await page.goto("/");
  await expect(page.locator(".chat-title")).toHaveText("Chat A");
  return { chats, sent, get previews() { return previews; } };
}

test("IME confirmation keeps the draft; ordinary Enter sends it", async ({ page }) => {
  const state = await openApp(page);
  const composer = page.getByRole("textbox", { name: "Source text", exact: true });
  await composer.fill("日本語");
  await composer.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true });
  await composer.dispatchEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229 });
  await expect(composer).toHaveValue("日本語");
  expect(state.sent).toHaveLength(0);
  await composer.press("Enter");
  await expect.poll(() => state.sent.length).toBe(1);
  expect(state.sent[0].text).toBe("日本語");
});

test("a late send response preserves the selected chat and its draft", async ({ page }) => {
  await openApp(page);
  const pending = deferred();
  const started = deferred();
  await page.route("**/api/chats/a/turns?*", async (route) => {
    started.resolve();
    await pending.promise;
    await route.fulfill({ json: { chat: chat("a") } });
  });
  const composer = page.getByRole("textbox", { name: "Source text", exact: true });
  await composer.fill("Message for A");
  await composer.press("Enter");
  await started.promise;
  await page.getByRole("button", { name: /^Chat B/ }).click();
  await expect(page.locator(".chat-title")).toHaveText("Chat B");
  await expect(page.getByRole("status", { name: "Sending..." })).toHaveCount(0);
  await composer.fill("Draft for B");
  const response = page.waitForResponse((response) => response.url().includes("/chats/a/turns?"));
  pending.resolve();
  await response;
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await expect(page.locator(".chat-title")).toHaveText("Chat B");
  await expect(composer).toHaveValue("Draft for B");
});

test("out-of-order chat loads preserve the most recent selection", async ({ page }) => {
  await openApp(page);
  const pending = deferred();
  const started = deferred();
  await page.route("**/api/chats/b?*", async (route) => {
    started.resolve();
    await pending.promise;
    await route.fulfill({ json: { chat: chat("b") } });
  });
  await page.getByRole("button", { name: /^Chat B/ }).click();
  await started.promise;
  await page.getByRole("button", { name: /^Chat C/ }).click();
  await expect(page.locator(".chat-title")).toHaveText("Chat C");
  const response = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/chats/b");
  pending.resolve();
  await (await response).finished();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator(".chat-title")).toHaveText("Chat C");
});

test("a background send failure restores the draft when its chat is reopened", async ({ page }) => {
  await openApp(page);
  const pending = deferred();
  const started = deferred();
  await page.route("**/api/chats/a/turns?*", async (route) => {
    started.resolve();
    await pending.promise;
    await route.fulfill({ status: 500, json: { error: "Translation unavailable" } });
  });
  const composer = page.getByRole("textbox", { name: "Source text", exact: true });
  await composer.fill("Keep this draft for A");
  await composer.press("Enter");
  await started.promise;
  await page.getByRole("button", { name: /^Chat B/ }).click();
  await expect(page.locator(".chat-title")).toHaveText("Chat B");
  pending.resolve();
  await expect(page.locator(".send-fab")).toHaveAttribute("aria-label", "Send");
  await expect(composer).toHaveValue("");
  await expect(page.locator(".composer-error")).toHaveCount(0);
  await page.getByRole("button", { name: /^Chat A/ }).click();
  await expect(composer).toHaveValue("Keep this draft for A");
  await expect(page.locator(".composer-error")).toHaveText("Translation unavailable");
});

test("a late regeneration response cannot reopen the previous chat", async ({ page }) => {
  await openApp(page);
  const pending = deferred();
  const started = deferred();
  await page.route("**/api/chats/a/turns/a-turn?*", async (route) => {
    started.resolve();
    await pending.promise;
    await route.fulfill({ json: { chat: chat("a") } });
  });
  await page.getByRole("button", { name: "Regenerate", exact: true }).click();
  await started.promise;
  await page.getByRole("button", { name: /^Chat B/ }).click();
  await expect(page.locator(".chat-title")).toHaveText("Chat B");
  const response = page.waitForResponse((response) => response.url().includes("/chats/a/turns/a-turn?"));
  pending.resolve();
  await (await response).finished();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator(".chat-title")).toHaveText("Chat B");
});

test("custom tone keeps the composer controls inside narrow viewports", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await openApp(page);
  await page.getByRole("combobox", { name: "Tone", exact: true }).selectOption("__custom__");
  await page.locator(".tone-custom-input").fill("Warm and conversational");
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 375, 390, 560, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    for (const selector of [".send-fab", ".tone-field select", ".tone-custom-input", ".composer-actions .mic-button", ".composer-actions > .ghost-button:last-child"]) {
      const control = page.locator(selector);
      await expect(control).toBeInViewport({ ratio: 1 });
      const bounds = await control.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    }
    const overflow = await page.locator(".composer").evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBe(0);
  }
});

for (const change of ["notes", "branch", "option"] as const) {
  test(`changing ${change} invalidates a preview before sending`, async ({ page }) => {
    const state = await openApp(page);
    await page.getByLabel("Live preview", { exact: true }).check();
    await page.getByRole("textbox", { name: "Source text", exact: true }).fill("Draft to translate");
    await expect(page.locator(".preview-turn")).toContainText("Preview 1");

    if (change === "notes") {
      await page.getByRole("button", { name: "Chat notes", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Chat notes" });
      await dialog.getByRole("textbox").fill("Formal business language");
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog).toHaveCount(0);
    } else if (change === "branch") {
      await page.locator(".conversation-turn .branch-switcher button").last().click();
      await expect(page.locator(".branch-count")).toHaveText("2/2");
    } else {
      await page.locator(".conversation-turn .option-row").click();
      await expect(page.locator(".conversation-turn .featured-text")).toHaveText("Another translation");
    }

    await expect(page.locator(".preview-turn")).toHaveCount(0);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => state.sent.length).toBe(1);
    expect(state.sent[0]).not.toHaveProperty("result");
  });
}

test("a context change refreshes the preview while an unchanged preview can be reused", async ({ page }) => {
  const state = await openApp(page);
  await page.getByLabel("Live preview", { exact: true }).check();
  await page.getByRole("textbox", { name: "Source text", exact: true }).fill("Draft to translate");
  await expect(page.locator(".preview-turn")).toContainText("Preview 1");
  await page.locator(".conversation-turn .option-row").click();
  await expect(page.locator(".preview-turn")).toContainText("Preview 2");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => state.sent.length).toBe(1);
  expect(state.sent[0].result).toEqual(translation("Preview 2"));
});

for (const modal of [
  { trigger: "Settings", label: "Settings" },
  { trigger: "Chat notes", label: "Chat notes" },
  { trigger: "Voice", label: "Voice conversation" },
]) {
  test(`${modal.label} contains focus and restores it after Escape`, async ({ page }) => {
    await openApp(page);
    const opener = page.getByRole("button", { name: modal.trigger, exact: true });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: modal.label, exact: true });
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Tab");
    await page.locator(".composer textarea").evaluate((element: HTMLTextAreaElement) => element.focus());
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
}
