// Only the authenticated desktop operations function may return these codes.
export async function decryptSeCode(ciphertext, secret) {
  if (!secret) throw new Error('SE codes require the server encryption key.');
  const bytes = Uint8Array.from(atob(ciphertext), ch => ch.charCodeAt(0));
  const raw = Uint8Array.from(atob(secret), ch => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},key,bytes.slice(12)));
}
