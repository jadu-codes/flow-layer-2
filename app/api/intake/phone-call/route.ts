import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", method: "GET" });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("📞 Incoming phone call payload:", body);

    // TEMP: just acknowledge receipt
    return NextResponse.json({ status: "ok", received: true });
  } catch (err) {
    console.error("Error handling phone call payload:", err);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}
