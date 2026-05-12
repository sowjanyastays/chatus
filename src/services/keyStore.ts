const KEY = 'chatus_e2ee_private_key';

export function savePrivateKey(secretKeyB64: string): void {
  localStorage.setItem(KEY, secretKeyB64);
}

export function loadPrivateKey(): string | null {
  return localStorage.getItem(KEY);
}

export function deletePrivateKey(): void {
  localStorage.removeItem(KEY);
}
