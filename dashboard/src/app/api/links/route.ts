import { NextRequest, NextResponse } from "next/server";

const BUN_API = process.env.BACKEND_API_URL ?? "http://localhost:3001";

export async function GET(req: NextRequest) {
  const page  = req.nextUrl.searchParams.get("page")  ?? "1";
  const limit = req.nextUrl.searchParams.get("limit") ?? "20";

  const res  = await fetch(`${BUN_API}/api/links?page=${page}&limit=${limit}`);
  const data = await res.json();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res  = await fetch(`${BUN_API}/shorten`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}