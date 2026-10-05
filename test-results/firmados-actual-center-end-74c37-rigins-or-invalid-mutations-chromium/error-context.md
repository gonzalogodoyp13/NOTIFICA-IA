# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: firmados.spec.ts >> actual center endpoint authenticates reads and rejects forged origins or invalid mutations
- Location: e2e\firmados.spec.ts:134:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 503
```