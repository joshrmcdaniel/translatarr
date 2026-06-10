import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "../../lib/auth";
import { locales } from "../../lib/i18n/messages";
import { getSettingsView, updateUserLocale, updateUserPrefs, updateUserSpeechPrefs } from "../../lib/settings-store";
import type { SettingsPayload } from "../../lib/settings-types";
import { defaultPromptTemplate } from "../../lib/translation-service";
import type { User } from "../../lib/user-store";

const userPrefsSchema = z.object({
  model: z.string().trim().max(200).nullable().optional(),
  systemPrompt: z.string().trim().max(8000).nullable().optional(),
  speechEngine: z.enum(["browser", "provider"]).nullable().optional(),
  locale: z.enum(locales).nullable().optional(),
});

function buildPayload(user: User): SettingsPayload {
  return {
    settings: getSettingsView(user),
    defaultSystemPrompt: defaultPromptTemplate,
  };
}

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  return NextResponse.json(buildPayload(user));
}

export async function PUT(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: z.infer<typeof userPrefsSchema>;

  try {
    body = userPrefsSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 });
  }

  const { speechEngine, locale, ...llmPrefs } = body;
  updateUserPrefs(user.id, llmPrefs);

  if (speechEngine !== undefined) {
    updateUserSpeechPrefs(user.id, { engine: speechEngine });
  }

  if (locale !== undefined) {
    updateUserLocale(user.id, locale);
  }

  return NextResponse.json(buildPayload(user));
}
