
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export const maxDuration = 30;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL;

    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing.");
      return NextResponse.json(
        { error: "Gemini API key is missing. Check your .env.local file." },
        { status: 500 }
      );
    }

    if (!model) {
      console.error("GEMINI_MODEL is missing.");
      return NextResponse.json(
        { error: "Gemini model is missing bae. Check your .env.local file." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const messages = body.messages as ChatMessage[];

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Please send a valid chat message." },
        { status: 400 }
      );
    }

    const validMessages = messages.filter(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0
    );

    if (validMessages.length === 0) {
      return NextResponse.json(
        { error: "No valid messages were provided." },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const contents = validMessages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

    const result = await ai.models.generateContent({
      model,
      contents,
      config: {
        maxOutputTokens: 512,
      },
    });

    const answer = result.text;

    if (!answer) {
      console.error("Gemini returned an empty response.");
      return NextResponse.json(
        { error: "Gemini returned an empty answer. Please try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ answer });
  } catch (error: unknown) {
    // Log the actual error in the VS Code terminal.
    if (error instanceof Error) {
      console.error("Gemini API error:", error.message);
    } else {
      console.error("Unknown Gemini API error:", error);
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unknown Gemini API error occurred.",
      },
      { status: 500 }
    );
  }
}
