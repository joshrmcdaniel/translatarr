import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "../../../lib/auth";
import { isSupportedLanguage } from "../../../lib/languages";
import { resolveSpeechSettings } from "../../../lib/settings-store";
import { synthesizeAudio } from "../../../lib/speech/provider-audio";

const synthesizeSchema = z.object({
  text: z.string().trim().min(1).max(4096),
  lang: z.string().min(2),
  voice: z.string().trim().max(100).optional(),
});

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: z.infer<typeof synthesizeSchema>;

  try {
    body = synthesizeSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send text and lang." }, { status: 400 });
  }

  if (!isSupportedLanguage(body.lang) || body.lang === "auto") {
    return NextResponse.json({ error: "Unsupported language selection." }, { status: 400 });
  }

  const settings = resolveSpeechSettings(user.id);

  if (!settings.apiKey) {
    return NextResponse.json({ error: "Speech provider is not configured." }, { status: 400 });
  }

  try {
    const upstream = await synthesizeAudio(settings, body.text, body.voice);

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text();
      console.error(`Speech synthesis failed (${upstream.status}): ${detail}`);
      return NextResponse.json({ error: "The speech service is unavailable." }, { status: 502 });
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Speech synthesis error", error);
    return NextResponse.json({ error: "The speech service is unavailable." }, { status: 502 });
  }
}
