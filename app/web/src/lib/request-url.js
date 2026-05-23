function firstHeaderValue(value) {
  return String(value || "")
    .split(",")[0]
    .trim();
}

export function getPublicOrigin(request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const host = forwardedHost || firstHeaderValue(request.headers.get("host"));
  const proto = forwardedProto || requestUrl.protocol.replace(":", "");

  if (!host) return requestUrl.origin;

  return `${proto}://${host}`;
}

export function publicRedirectUrl(request, path) {
  return new URL(path, getPublicOrigin(request));
}
