import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "../../../lib/auth";
import { getSettingsView, updateSettingsOverrides } from "../../../lib/settings-store";
import type { SettingsPayload } from "../../../lib/settings-types";
import { defaultPromptTemplate } from "../../../lib/translation-service";
import type { User } from "../../../lib/user-store";

const instanceSchema = z.object({
  provider: z.enum(["openai-compatible", "anthropic", "custom"]).nullable().optional(),
  apiKey: z.string().trim().max(500).nullable().optional(),
  model: z.string().trim().max(200).nullable().optional(),
  baseUrl: z.string().trim().url().max(500).nullable().optional(),
  systemPrompt: z.string().trim().max(8000).nullable().optional(),
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

  updateSettingsOverrides(body);
  return NextResponse.json(buildPayload(user));
}
