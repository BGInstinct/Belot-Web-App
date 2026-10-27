import { describe, expect, it } from 'vitest';
import { bestAnnouncementSet, canDeclareBelot, makeBelot, resolveAnnouncements, validateAnnouncements } from './announcements';
import { detectAnnouncements } from './index';
import { cards, trick } from './testutil';
import type { Announcement, Contract, Seat } from './types';

const H: Contract = { kind: 'suit', suit: 'H' };
const AT: Contract = { kind: 'AT' };
const NT: Contract = { kind: 'NT' };
const summary = (as: Announcement[]) => as.map((a) => `${a.type}:${a.highRank}${a.suit ?? ''}:${a.points}`).sort();

describe('detection', () => {
  it('tierce / quarte / quint', () => {
    expect(summary(bestAnnouncementSet(cards('7S 8S 9S AH KD 7C 9C 10D'), H))).toEqual(['tierce:9S:20']);
    expect(summary(bestAnnouncementSet(cards('10S JS QS KS 7H 9D 7C 8D'), H))).toEqual(['quarte:KS:50']);
    expect(summary(bestAnnouncementSet(cards('10S JS QS KS AS 9D 7C 8D'), H))).toEqual(['quint:AS:100']);
  });
  it('6-run is a single quint', () => {
    const r = bestAnnouncementSet(cards('9S 10S JS QS KS AS 7C 8D'), H);
    expect(summary(r)).toEqual(['quint:AS:100']);
    expect(r[0].cards).toHaveLength(6);
  });
  it('8-run = quint + tierce', () => {
    expect(summary(bestAnnouncementSet(cards('7S 8S 9S 10S JS QS KS AS'), H))).toEqual(['quint:AS:100', 'tierce:9S:20']);
  });
  it('two sequences in different suits', () => {
    expect(summary(bestAnnouncementSet(cards('7S 8S 9S QH KH AH 7C 8D'), AT))).toEqual(['tierce:9S:20', 'tierce:AH:20']);
  });
  it('carres: values and 7/8 ignored', () => {
    expect(summary(bestAnnouncementSet(cards('JS JH JD JC 7S 8D 10C AH'), H))).toEqual(['carre:J:200']);
    expect(summary(bestAnnouncementSet(cards('9S 9H 9D 9C 7S 8D 10C AH'), H))).toEqual(['carre:9:150']);
    expect(summary(bestAnnouncementSet(cards('AS AH AD AC 7S 8D 10C KH'), H))).toEqual(['carre:A:100']);
    expect(bestAnnouncementSet(cards('7S 7H 7D 7C 8S 8H 8D 8C'), H)).toEqual([]);
  });
  it('a card is in a carre or a sequence, not both — best split chosen', () => {
    // JH belongs to carre J and to J-Q-K-A of hearts → carre J (200) + tierce Q-K-A (20)
    expect(summary(bestAnnouncementSet(cards('JC JD JS JH QH KH AH 7C'), H))).toEqual(['carre:J:200', 'tierce:AH:20']);
    // 10-J-Q-K-A of spades + three other Qs: quint (100) vs carre Q (100) + nothing → tie on points,
    // prefer the stronger sequence
    expect(summary(bestAnnouncementSet(cards('10S JS QS KS AS QH QD QC'), H))).toEqual(['quint:AS:100']);
  });
  it('none in NT', () => {
    expect(detectAnnouncements(cards('JS JH JD JC 7S 8S 9S 10C'), NT)).toEqual([]);
    expect(bestAnnouncementSet(cards('JS JH JD JC 7S 8S 9S 10C'), NT)).toEqual([]);
  });
  it('detectAnnouncements lists overlapping options for manual choice', () => {
    const s = summary(detectAnnouncements(cards('JC JD JS JH QH KH AH 7C'), H));
    expect(s).toContain('carre:J:200');
    expect(s).toContain('quarte:AH:50');
    expect(s).toContain('tierce:AH:20');
  });
});

describe('manual validation', () => {
  const hand = cards('JC JD JS JH QH KH AH 7C');
  const carre = bestAnnouncementSet(hand, H).find((a) => a.type === 'carre')!;
  it('accepts valid non-overlapping set', () => {
    expect(validateAnnouncements(hand, H, [carre, { type: 'tierce', cards: cards('QH KH AH'), points: 999, highRank: 'A' }])).toHaveLength(2);
  });
  it('canonicalises points', () => {
    expect(validateAnnouncements(hand, H, [{ type: 'tierce', cards: cards('QH KH AH'), points: 999, highRank: 'Q' }])![0].points).toBe(20);
  });
  it('rejects overlap, missing cards, wrong type, gaps, NT, belot type', () => {
    expect(validateAnnouncements(hand, H, [carre, { type: 'quarte', cards: cards('JH QH KH AH'), points: 50, highRank: 'A' }])).toBeNull();
    expect(validateAnnouncements(hand, H, [{ type: 'tierce', cards: cards('KH AH 10H'), points: 20, highRank: 'A' }])).toBeNull();
    expect(validateAnnouncements(hand, H, [{ type: 'quarte', cards: cards('QH KH AH'), points: 50, highRank: 'A' }])).toBeNull();
    expect(validateAnnouncements(cards('7S 9S 10S JS'), H, [{ type: 'tierce', cards: cards('7S 9S 10S'), points: 20, highRank: '10' }])).toBeNull();
    expect(validateAnnouncements(hand, NT, [carre])).toBeNull();
    expect(validateAnnouncements(hand, H, [makeBelot('H')])).toBeNull();
    expect(validateAnnouncements(hand, NT, [])).toEqual([]);
  });
});

describe('belot', () => {
  it('suit game: only trump Q/K while holding the partner card', () => {
    expect(canDeclareBelot(cards('QH KH 7S'), cards('QH')[0], H, null)).toBe(true);
    expect(canDeclareBelot(cards('QH KH 7S'), cards('KH')[0], H, trick(0, 'AS'))).toBe(true); // ruffing
    expect(canDeclareBelot(cards('QS KS'), cards('QS')[0], H, null)).toBe(false);
    expect(canDeclareBelot(cards('QH 7S'), cards('QH')[0], H, null)).toBe(false);
    expect(canDeclareBelot(cards('QH KH'), cards('QH')[0], NT, null)).toBe(false);
  });
  it('AT: any suit, but only when leading or following that suit', () => {
    expect(canDeclareBelot(cards('QS KS'), cards('QS')[0], AT, null)).toBe(true);
    expect(canDeclareBelot(cards('QS KS'), cards('QS')[0], AT, trick(0, '7S'))).toBe(true);
    expect(canDeclareBelot(cards('QS KS'), cards('QS')[0], AT, trick(0, '7D'))).toBe(false);
  });
});

describe('resolution', () => {
  const seq = (s: string) => bestAnnouncementSet(cards(s), AT)[0];
  const d = (seat: Seat, a: Announcement) => ({ seat, announcement: a });
  it('only the team with the best sequence scores (all its sequences)', () => {
    const r = resolveAnnouncements([d(0, seq('QS KS AS')), d(2, seq('7D 8D 9D')), d(1, seq('JH QH KH'))]);
    expect(r.combos).toEqual([40, 0]);
  });
  it('longer beats higher', () => {
    expect(resolveAnnouncements([d(0, seq('QS KS AS')), d(3, seq('7D 8D 9D 10D'))]).combos).toEqual([0, 50]);
  });
  it('exact tie cancels all sequences', () => {
    expect(resolveAnnouncements([d(0, seq('QS KS AS')), d(2, seq('7C 8C 9C')), d(1, seq('QH KH AH'))]).combos).toEqual([0, 0]);
  });
  it('carres: higher carre side takes its carres, sequences resolved independently', () => {
    const cQ = bestAnnouncementSet(cards('QS QH QD QC'), AT)[0];
    const c9 = bestAnnouncementSet(cards('9S 9H 9D 9C'), AT)[0];
    const cA = bestAnnouncementSet(cards('AS AH AD AC'), AT)[0];
    expect(resolveAnnouncements([d(0, cQ), d(1, c9), d(0, seq('7D 8D 9D'))]).combos).toEqual([20, 150]);
    expect(resolveAnnouncements([d(0, cQ), d(1, cA)]).combos).toEqual([0, 100]);
    expect(resolveAnnouncements([d(0, cQ), d(2, cA)]).combos).toEqual([200, 0]);
  });
  it('belot always counts', () => {
    const r = resolveAnnouncements([d(0, seq('7D 8D 9D 10D')), d(1, seq('7C 8C 9C')), d(1, makeBelot('H'))]);
    expect(r).toEqual({ combos: [50, 0], belot: [0, 20] });
  });
});
