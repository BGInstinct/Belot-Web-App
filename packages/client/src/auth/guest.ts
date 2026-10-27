/** Guest identity: stable id + fun random name, persisted in localStorage. */
const ID_KEY = 'belot.guest.id';
const NAME_KEY = 'belot.guest.name';

const ADJECTIVES = ['Lucky', 'Sly', 'Brave', 'Sneaky', 'Jolly', 'Mighty', 'Clever', 'Wild', 'Grumpy', 'Swift', 'Royal', 'Cosmic', 'Pixel', 'Bold', 'Sleepy'];
const NOUNS = ['Jack', 'Queen', 'King', 'Ace', 'Trump', 'Joker', 'Fox', 'Bear', 'Owl', 'Wolf', 'Badger', 'Dealer', 'Bluffer', 'Capo', 'Belote'];

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function randomGuestName(): string {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  return `${pick(ADJECTIVES)}${pick(NOUNS)}${Math.floor(Math.random() * 90) + 10}`;
}

export const GUEST_NAME_MAX = 20;

export function sanitizeName(name: string): string {
  return name.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, GUEST_NAME_MAX);
}

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
}

export function loadGuest(): { id: string; name: string } {
  let id = safeGet(ID_KEY);
  if (!id || !id.startsWith('guest-')) {
    id = `guest-${uuid()}`;
    safeSet(ID_KEY, id);
  }
  let name = safeGet(NAME_KEY);
  if (!name || !sanitizeName(name)) {
    name = randomGuestName();
    safeSet(NAME_KEY, name);
  }
  return { id, name };
}

export function saveGuestName(name: string) {
  safeSet(NAME_KEY, name);
}
