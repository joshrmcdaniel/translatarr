import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "../../../lib/auth";
import {
  getSettingsView,
  setUpdateCheckEnabled,
  updateSettingsOverrides,
  updateSpeechOverrides,
} from "../../../lib/settings-store";
import type { SettingsPayload } from "../../../lib/settings-types";
import { defaultPromptTemplate } from "../../../lib/translation-service";
import type { User } from "../../../lib/user-store";

const instanceSchema = z.object({
  provider: z.enum(["openai-compatible", "anthropic", "custom"]).nullable().optional(),
  apiKey: z.string().trim().max(500).nullable().optional(),
  model: z.string().trim().max(200).nullable().optional(),
  baseUrl: z.string().trim().url().max(500).nullable().optional(),
  systemPrompt: z.string().trim().max(8000).nullable().optional(),
  speechEngine: z.enum(["browser", "provider"]).nullable().optional(),
  speechApiKey: z.string().trim().max(500).nullable().optional(),
  speechBaseUrl: z.string().trim().url().max(500).nullable().optional(),
  speechSttModel: z.string().trim().max(200).nullable().optional(),
  speechTtsModel: z.string().trim().max(200).nullable().optional(),
  speechTtsVoice: z.string().trim().max(100).nullable().optional(),
  updateCheckEnabled: z.boolean().nullable().optional(),
});

function buildPayload(user: User): SettingsPayload {
  return {
    settings: getSettingsView(user),
    defaultSystemPrompt: defaultPromptTemplate,
  };
}

export async function PUT(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: z.infer<typeof instanceSchema>;

  try {
    body = instanceSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 });
  }

  const {
    speechEngine,
    speechApiKey,
    speechBaseUrl,
    speechSttModel,
    speechTtsModel,
    speechTtsVoice,
    updateCheckEnabled,
    ...llmOverrides
  } = body;

  updateSettingsOverrides(llmOverrides);
  updateSpeechOverrides({
    engine: speechEngine,
    apiKey: speechApiKey,
    baseUrl: speechBaseUrl,
    sttModel: speechSttModel,
    ttsModel: speechTtsModel,
    ttsVoice: speechTtsVoice,
  });

  if (updateCheckEnabled !== undefined) {
    setUpdateCheckEnabled(updateCheckEnabled);
  }

  return NextResponse.json(buildPayload(user));
}
