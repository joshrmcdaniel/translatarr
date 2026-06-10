import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "../../lib/auth";
import { isSupportedLanguage } from "../../lib/languages";
import { MalformedLLMResponseError, translateText } from "../../lib/translation-service";

const requestSchema = z.object({
  text: z.string().trim().min(1).max(12000),
  sourceLang: z.string().min(2),
  targetLang: z.string().min(2),
});

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: z.infer<typeof requestSchema>;

  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send text, sourceLang, and targetLang." }, { status: 400 });
  }

  if (!isSupportedLanguage(body.sourceLang) || !isSupportedLanguage(body.targetLang) || body.targetLang === "auto") {
    return NextResponse.json({ error: "Unsupported language selection." }, { status: 400 });
  }

  try {
    const result = await translateText({ ...body, userId: user.id });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MalformedLLMResponseError) {
      console.error("Malformed translation response", error);
      return NextResponse.json(
        { error: "The translation service returned an invalid response. Please try again." },
        { status: 422 },
      );
    }

    console.error("Translation provider error", error);
    return NextResponse.json({ error: "The translation service is unavailable." }, { status: 502 });
  }
}
