"use client";

export function readCookie(name) {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
}

export function csrfHeaders(baseHeaders = {}) {
  const token = readCookie("acctly_csrf");
  return token
    ? {
        ...baseHeaders,
        "x-csrf-token": decodeURIComponent(token)
      }
    : baseHeaders;
}
