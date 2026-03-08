// gemini-proxy: Suno AI music prompt generator via Gemini Flash
// Environment: GOOGLE_API_KEY

const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY")!;
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_API_KEY}`;
const GEMINI_TIMEOUT_MS = 30_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are a Suno AI music prompt expert. Generate professional-quality Suno Custom mode prompts from natural language requests.

=== STYLE FIELD RULES (GMVI Formula) ===
- Tag order = priority. Earlier tags get stronger influence.
- Optimal order: [Era/Core Genre], [Sub-style/Fusion], [Mood/Energy], [Instruments], [Vocal Type], [Production/BPM]
- 4-8 tags optimal (max 12). Under 200 characters.
- Max 2 genre mixtures (3+ causes drift)
- Keywords only, NOT sentences
- Always add "polished production" at end for quality

=== LYRICS FIELD RULES ===
- Use structure tags: [Intro], [Verse 1], [Pre-Chorus], [Chorus], [Bridge], [Outro], [End]
- Verse: 4-8 lines, Chorus: 2-4 lines
- Pipe stacking for nuance: [Verse 1 | Melancholic | Clear Articulation]
- () for ad-libs/backing vocals
- ALL CAPS for emphasis
- Commas for short pauses, ... for breathing

=== INSTRUMENTAL/BGM MODE ===
When instrumental is true:
- Include "instrumental" in style field
- Lyrics field: structure tags ONLY (no lyrics text)
- Example structure tags: [Short Instrumental Intro], [Gentle Piano Theme], [Building Section], [Theme Reprise], [Fade Out]

=== FORBIDDEN (NEVER do these) ===
- Contradicting tags ("calm aggressive")
- 3+ genre mixing
- Sentence-style style field
- Negative words in style ("no drums") - model focuses on "drums"
- Video terms ([4k Audio], [Masterpiece])
- BPM in lyrics field (goes in style field)
- Unspecified vocals (always specify gender + style + tone)

=== LANGUAGE RULES ===
- Style field: ALWAYS in English
- Lyrics: In the requested language
- Structure tags ([Verse], [Chorus]): ALWAYS in English

=== GENRE REFERENCE ===
Use these as base, adapt as needed:
- Pop: Modern pop, K-Pop, Indie pop, City pop, Retro pop
- Hip-hop/R&B: Trap, Boom bap, Lo-fi hip hop, R&B, Neo-soul
- Electronic: Deep house, Techno, EDM, Synthwave, Chillout
- Rock: Indie rock, Alternative, Pop rock, Metal, Post-rock
- Acoustic: Folk, Country, Acoustic pop, Bossa nova
- Jazz/Classical: Jazz, Smooth jazz, Orchestral, Piano solo
- Mood-based: Lullaby, Meditation, Cafe, Workout, Study, Drive, Romantic dinner, Church worship, Suspense, Epic
- World: Afropop, Latin, Reggae, Middle Eastern, Asian fusion

=== OUTPUT FORMAT ===
Return ONLY a valid JSON array. No markdown, no explanation, no code fences.
Each item must have exactly these fields:
- "title": string (English)
- "style": string (English, under 200 chars)
- "lyrics": string (structure tags + lyrics in requested language; for instrumental, ONLY descriptive structure tags like [Gentle Piano Theme], [Building Orchestral Section])`;

interface RequestBody {
  userRequest: string;
  mode?: "custom";
  count?: number;
  language?: string;
  instrumental?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const {
      userRequest,
      count = 1,
      language = "en",
      instrumental = false,
    } = body;

    if (!userRequest || typeof userRequest !== "string") {
      return jsonResponse({ error: "userRequest is required" }, 400);
    }

    const clampedCount = Math.min(Math.max(count, 1), 10);

    const userPrompt = [
      `Request: ${userRequest}`,
      `Number of prompts: ${clampedCount}`,
      `Language for lyrics: ${language}`,
      `Instrumental: ${instrumental}`,
      `Generate ${clampedCount} Suno Custom mode prompt(s). Return ONLY a JSON array.`,
    ].join("\n");

    // Call Gemini Flash API with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    let geminiRes: Response;
    try {
      geminiRes = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
          },
        }),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return jsonResponse({ error: "Gemini API timeout (30s)" }, 504);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => "");
      console.error("[gemini-proxy] Gemini API error:", geminiRes.status, errBody);

      if (geminiRes.status === 429) {
        return jsonResponse({ error: "Rate limit exceeded. Try again later." }, 429);
      }
      return jsonResponse(
        { error: `Gemini API error (${geminiRes.status})` },
        502
      );
    }

    const geminiData = await geminiRes.json();
    const rawText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Parse the JSON array from Gemini response
    let prompts: Array<{ title: string; style: string; lyrics: string }>;
    try {
      const parsed = JSON.parse(rawText);
      prompts = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      console.error("[gemini-proxy] Failed to parse Gemini output:", rawText);
      return jsonResponse(
        { error: "Failed to parse Gemini response" },
        502
      );
    }

    // Normalize output: ensure each prompt has required fields + inject mode
    const mode = body.mode ?? "custom";
    const result = prompts.slice(0, clampedCount).map((p) => ({
      mode,
      title: p.title ?? "Untitled",
      style: (p.style ?? "").slice(0, 200),
      lyrics: p.lyrics ?? "",
    }));

    return jsonResponse({ prompts: result });
  } catch (err) {
    console.error("[gemini-proxy] Unexpected error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
