import { NextRequest, NextResponse } from 'next/server'
import { ApiError, withApiUser } from '@/lib/api/server'
import { prisma } from '@/lib/prisma'
import { downloadReplyAttachment } from '@/lib/recibos/reply-attachments'

export async function GET(req: NextRequest, { params }: { params: { replyId: string; attachmentId: string } }) {
  return withApiUser(req, 'download receipt reply attachment', async user => {
    const attachment = await prisma.recibosDispatchReplyAttachment.findFirst({ where: { id: params.attachmentId, replyId: params.replyId, reply: { officeId: user.officeId } }, include: { reply: true } })
    if (!attachment) throw new ApiError('NOT_FOUND', 'Adjunto no encontrado.', 404)
    const bytes = await downloadReplyAttachment(attachment.reply, attachment)
    const filename = attachment.filename.replace(/[\r\n\\/]/g, '_') || 'adjunto'
    return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="adjunto"; filename*=UTF-8''${encodeURIComponent(filename).replace(/'/g, '%27')}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
  })
}
