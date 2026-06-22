export type RetryMailMessage = {
  to: string[]
  subject: string
  text: string
  attachments: unknown[]
}

export type RetryMailResult = {
  provider: string
  messageId: string
}

export interface RetryMailAdapter {
  provider: string
  send(message: RetryMailMessage): Promise<RetryMailResult>
}

export async function sendWithRetries<TMessage extends RetryMailMessage, TResult extends RetryMailResult>(
  adapter: { send(message: TMessage): Promise<TResult> },
  message: TMessage,
  attempts = 3
) {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await adapter.send(message)
      return { ...result, attempts: attempt }
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No se pudo enviar el correo.')
}
