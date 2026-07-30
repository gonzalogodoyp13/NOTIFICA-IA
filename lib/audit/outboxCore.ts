export function retryDelayMinutes(attempts: number) {
  if (attempts <= 1) return 1
  if (attempts === 2) return 5
  if (attempts === 3) return 15
  return 60
}
