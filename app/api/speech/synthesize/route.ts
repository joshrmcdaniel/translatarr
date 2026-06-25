import { NextResponse } from "next/server";
import { getSessionUser } from "../../../lib/auth";
import { synthesizeBodySchema, type SynthesizeBody } from "../../../lib/request-schemas";
import { resolveSpeechSettings } from "../../../lib/settings-store";
import { synthesizeAudio } from "../../../lib/speech/provider-audio";
import { speechErrorResponse } from "../../../lib/speech/speech-error";

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: SynthesizeBody;

  try {
    body = synthesizeBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send text and lang." }, { status: 400 });
  }

  const settings = resolveSpeechSettings(user.id);

  if (!settings.apiKey) {
    return NextResponse.json({ error: "Speech provider is not configured." }, { status: 400 });
  }

  try {
    const upstream = await synthesizeAudio(settings, body.text, body.voice);

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return speechErrorResponse(error);
  }
}
