import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";

export async function GET(request) {
  const auth = await requirePermission(request, "messages");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await auth.admin
    .from("contact_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ messages: data || [] });
}

export async function POST(request) {
  const auth = await requirePermission(request, "messages");
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id, handled } = await request.json();
  const { error } = await auth.admin
    .from("contact_messages")
    .update({ handled: Boolean(handled) })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
