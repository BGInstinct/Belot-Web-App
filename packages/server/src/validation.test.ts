import { describe, expect, it } from 'vitest';
import { cleanText, parseAction, parseBoolean, parseProfile, parseBotDifficulty, parseSeat, parseSettings } from './validation';

describe('validation', () => {
  it('settings', () => {
    expect(parseSettings({ forceHigherCardPlacement: true, manualAnnounceOnly: false, turnTimerSeconds: 30, evil: 1 })).toEqual({
      forceHigherCardPlacement: true,
      manualAnnounceOnly: false,
      turnTimerSeconds: 30,
      botDifficulty: 'medium', // missing → default (older clients)
    });
    expect(parseSettings({ forceHigherCardPlacement: true, manualAnnounceOnly: false, turnTimerSeconds: 31 })).toBeNull();
    expect(parseSettings({ forceHigherCardPlacement: 'yes', manualAnnounceOnly: false, turnTimerSeconds: 30 })).toBeNull();
    expect(parseSettings(null)).toBeNull();
  });
  it('settings: botDifficulty', () => {
    const base = { forceHigherCardPlacement: false, manualAnnounceOnly: true, turnTimerSeconds: 45 };
    for (const d of ['easy', 'medium', 'hard'] as const) {
      expect(parseSettings({ ...base, botDifficulty: d })).toEqual({ ...base, botDifficulty: d });
    }
    expect(parseSettings({ ...base, botDifficulty: undefined })?.botDifficulty).toBe('medium');
    for (const bad of ['Easy', 'HARD', 'expert', '', ' hard', null, 1, true, {}, ['hard']]) {
      expect(parseSettings({ ...base, botDifficulty: bad }), String(bad)).toBeNull();
    }
    expect(parseBotDifficulty('hard')).toBe('hard');
    expect(parseBotDifficulty(undefined)).toBe('medium');
    expect(parseBotDifficulty('nightmare')).toBeNull();
  });
  it('boolean', () => {
    expect(parseBoolean(true)).toBe(true);
    expect(parseBoolean(false)).toBe(false);
    expect(parseBoolean('true')).toBeNull();
    expect(parseBoolean(1)).toBeNull();
    expect(parseBoolean(undefined)).toBeNull();
  });
  it('seat', () => {
    expect(parseSeat(2)).toBe(2);
    expect(parseSeat(4)).toBeNull();
    expect(parseSeat('1')).toBeNull();
  });
  it('profile', () => {
    expect(parseProfile({ id: 'guest-1', name: '  Ivan  ', isGuest: false, admin: true })).toEqual({ id: 'guest-1', name: 'Ivan', isGuest: true });
    expect(parseProfile({ id: 'bot:x', name: 'x' })).toBeNull();
    expect(parseProfile({ id: 'a b', name: 'x' })).toBeNull();
    expect(parseProfile({ id: 'a', name: '' })).toBeNull();
    expect(parseProfile({ id: 'a', name: 'x'.repeat(25) })).toBeNull();
    expect(parseProfile({ id: 'a', name: 'x', cardSkin: '<script>' })).toBeNull();
    expect(parseProfile({ id: 'a', name: 'x', cardSkin: 'gold-1', avatar: '/assets/a.png' })).toMatchObject({ cardSkin: 'gold-1', avatar: '/assets/a.png' });
  });
  it('actions', () => {
    expect(parseAction({ type: 'bid', bid: { kind: 'pass' } })).toEqual({ type: 'bid', bid: { kind: 'pass' } });
    expect(parseAction({ type: 'bid', bid: { kind: 'contract', contract: { kind: 'suit', suit: 'H' } } })).toEqual({
      type: 'bid',
      bid: { kind: 'contract', contract: { kind: 'suit', suit: 'H' } },
    });
    expect(parseAction({ type: 'bid', bid: { kind: 'contract', contract: { kind: 'suit', suit: 'X' } } })).toBeNull();
    expect(parseAction({ type: 'play', card: { suit: 'S', rank: '10' }, belot: true, extra: 1 })).toEqual({
      type: 'play',
      card: { suit: 'S', rank: '10' },
      belot: true,
    });
    expect(parseAction({ type: 'play', card: { suit: 'S', rank: '6' } })).toBeNull();
    expect(parseAction({ type: 'play', card: { suit: 'S', rank: 'A' }, announcements: 'x' })).toBeNull();
    expect(
      parseAction({
        type: 'play',
        card: { suit: 'S', rank: 'A' },
        announcements: [{ type: 'tierce', cards: [{ suit: 'S', rank: 'A' }, { suit: 'S', rank: 'K' }, { suit: 'S', rank: 'Q' }], points: 20, highRank: 'A', suit: 'S' }],
      }),
    ).not.toBeNull();
    expect(parseAction({ type: 'cheat' })).toBeNull();
  });
  it('claim action', () => {
    const parsed = parseAction({ type: 'claim' });
    expect(parsed).toEqual({ type: 'claim' });
    expect(Object.keys(parsed!)).toEqual(['type']);
    expect(parseAction({ type: 'claim', seat: 2 })).toBeNull();
    expect(parseAction({ type: 'claim', success: true })).toBeNull();
    expect(parseAction({ type: 'claim', card: { suit: 'S', rank: 'A' } })).toBeNull();
    expect(parseAction({ type: 'CLAIM' })).toBeNull();
    expect(parseAction([{ type: 'claim' }])).toBeNull();
    expect(parseAction('claim')).toBeNull();
  });
  it('chat text', () => {
    expect(cleanText('  hi\u0000 there\n ', 200)).toBe('hi there');
    expect(cleanText('   ', 200)).toBeNull();
    expect(cleanText('x'.repeat(201), 200)).toBeNull();
    expect(cleanText(5, 200)).toBeNull();
  });
});
