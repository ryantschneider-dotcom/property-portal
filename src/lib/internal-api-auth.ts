function unauthorizedResponse() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export function requireInternalBearer(request: Request, expectedToken?: string | null) {
  if (!expectedToken) return null;

  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1] !== expectedToken) {
    return unauthorizedResponse();
  }

  return null;
}
