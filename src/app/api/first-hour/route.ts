import { NextResponse } from "next/server";
import { fetchPonsTokens } from "@/lib/firstHour/pons-data";
import type { FirstHourResponse } from "@/lib/firstHour/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const { tokens, health } = await fetchPonsTokens();

    const response: FirstHourResponse = {
      tokens,
      health,
      timestamp: Date.now(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching first hour tokens:", error);
    return NextResponse.json(
      { error: "Failed to fetch tokens" },
      { status: 500 }
    );
  }
}
