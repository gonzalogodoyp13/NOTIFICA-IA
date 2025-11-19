// API Latency Middleware
// Logs every API request with pathname, method, and handler duration
import { NextResponse } from "next/server";

export async function middleware(req: Request) {
  const start = Date.now();
  const pathname = new URL(req.url).pathname;
  const method = req.method;

  const res = NextResponse.next();

  const duration = Date.now() - start;

  res.headers.set("X-API-Latency", `${duration}`);
  res.headers.set("X-API-Path", pathname);
  res.headers.set("X-API-Method", method);

  console.log("[API LATENCY]", {
    path: pathname,
    method: method,
    totalMs: duration,
  });

  return res;
}

