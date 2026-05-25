export function authRedirectPath(error) {
  if (error.status === 428) return "/change-password";
  if (error.status === 403) return "/forbidden";
  return "/login";
}
