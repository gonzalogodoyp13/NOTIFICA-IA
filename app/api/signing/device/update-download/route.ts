import { desktopUpdateDownload } from '@/lib/signing/desktopUpdate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The distributed software is downloadable without a GitHub login. The private
// repository and its access token remain server-side.
export async function GET() {
  try { return await desktopUpdateDownload() }
  catch { return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
}
