import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, message: "Estampos GET placeholder" });
}

export async function POST() {
  return NextResponse.json({ ok: true, message: "Estampos POST placeholder" });
}

export async function PUT() {
  return NextResponse.json({ ok: true, message: "Estampos PUT placeholder" });
}

export async function DELETE() {
  return NextResponse.json({ ok: true, message: "Estampos DELETE placeholder" });
}

