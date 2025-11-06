// API route: /api/ping
// Simple health check endpoint that returns {ok: true}
// Used to verify the API is working
import { NextResponse } from 'next/server'

export async function GET() {
  // Return success response
  return NextResponse.json({ ok: true })
}

