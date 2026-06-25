import { NextResponse } from "next/server";
import { getSessionUser } from "../../../lib/auth";
import { isSupportedLanguage } from "../../../lib/languages";
import { resolveSpeechSettings } from "../../../lib/settings-store";
import { transcribeAudio } from "../../../lib/speech/provider-audio";
import { speechErrorResponse } from "../../../lib/speech/speech-error";

const maxAudioBytes = 15 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send multipart form data with an audio file." }, { status: 400 });
  }

  const file = form.get("file");

  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "Send a non-empty audio file." }, { status: 400 });
  }

  if (file.size > maxAudioBytes) {
    return NextResponse.json({ error: "Audio file is too large (max 15 MB)." }, { status: 400 });
  }

  const language = form.get("language");

  if (language !== null && (typeof language !== "string" || !isSupportedLanguage(language))) {
    return NextResponse.json({ error: "Unsupported language selection." }, { status: 400 });
  }

  const settings = resolveSpeechSettings(user.id);

  if (!settings.apiKey) {
    return NextResponse.json({ error: "Speech provider is not configured." }, { status: 400 });
  }

  const filename = file instanceof File && file.name ? file.name : "audio.webm";
  const transcriptionLanguage = language && language !== "auto" ? language : undefined;

  try {
    const text = await transcribeAudio(settings, file, filename, transcriptionLanguage);
    return NextResponse.json({ text });
  } catch (error) {
    return speechErrorResponse(error);
  }
}
