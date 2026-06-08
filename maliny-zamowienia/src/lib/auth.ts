// Prosta ochrona hasłem (MVP). Token = SHA-256 z hasła z env.
// Liczony tak samo w Node (login route) i na Edge (middleware) przez Web Crypto.

export const AUTH_COOKIE = "maliny_auth";

export async function passwordToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`maliny:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
