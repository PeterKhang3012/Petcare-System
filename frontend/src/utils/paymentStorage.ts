const storageKey = (userId: string, suffix: string) => 'pawstay.payment.' + userId + '.' + suffix;
export function rememberPayment(userId: string, bookingId: string, paymentId: string) {
  localStorage.setItem(storageKey(userId, bookingId), paymentId);
  localStorage.setItem(storageKey(userId, 'latest'), paymentId);
}
export const knownPayment = (userId: string, bookingId = 'latest') => localStorage.getItem(storageKey(userId, bookingId));
export function paymentKey(userId: string, bookingId: string) {
  const key = storageKey(userId, 'request.' + bookingId);
  const previous = localStorage.getItem(key);
  if (previous) return previous;
  const value = crypto.randomUUID();
  localStorage.setItem(key, value);
  return value;
}
export function rememberPaymentKey(userId: string, bookingId: string, key: string) {
  localStorage.setItem(storageKey(userId, 'request.' + bookingId), key);
}
export const existingPaymentKey = (userId: string, bookingId: string) => localStorage.getItem(storageKey(userId, 'request.' + bookingId));
