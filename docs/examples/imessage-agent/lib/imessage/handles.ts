// Normalize a phone/email handle for comparison. Phone numbers collapse to
// their last 10 digits so "+15551234567" and "(555) 123-4567" match.
export function normalizeHandle(handle: string): string {
  if (handle.includes("@")) return handle.trim().toLowerCase();
  const digits = handle.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// Short codes (2FA / marketing senders) are bare numbers, no "+". Skip them.
export function isShortCode(handle: string): boolean {
  return /^\d{2,6}$/.test(handle);
}
