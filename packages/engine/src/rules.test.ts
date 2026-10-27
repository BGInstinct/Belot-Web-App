import { describe, expect, it } from 'vitest';
import { currentWinningPlay } from './cards';
import { legalCardsFor } from './rules';
import { cards, ids, trick } from './testutil';
import type { Contract } from './types';

const H: Contract = { kind: 'suit', suit: 'H' };
const NT: Contract = { kind: 'NT' };
const AT: Contract = { kind: 'AT' };

const legal = (hand: string, t: ReturnType<typeof trick>, contract: Contract, strict: boolean) =>
  ids(legalCardsFor(cards(hand), t, contract, strict, ((t.leader + t.plays.length) % 4) as 0 | 1 | 2 | 3));

describe('trick winner', () => {
  it('suit game: highest trump wins', () => {
    expect(currentWinningPlay(trick(0, 'AS 7H 10S 9H'), H).seat).toBe(3);
    expect(currentWinningPlay(trick(0, 'AS JH 10S 9H'), H).seat).toBe(1);
  });
  it('suit game: no trump → highest of led suit (off-suit cards never win)', () => {
    expect(currentWinningPlay(trick(0, 'KS AD 10S JS'), H).seat).toBe(2);
    expect(currentWinningPlay(trick(1, '9S AD AC 7S'), H).seat).toBe(1);
  });
  it('NT uses plain ranking', () => {
    expect(currentWinningPlay(trick(0, 'JS 9S 10S AH'), NT).seat).toBe(2);
  });
  it('AT uses trump ranking in the led suit', () => {
    expect(currentWinningPlay(trick(0, 'AS 9S 10S JH'), AT).seat).toBe(1);
    expect(currentWinningPlay(trick(0, 'AS 9S JS JH'), AT).seat).toBe(2);
  });
});

describe('legal cards — strict', () => {
  it('lead: anything', () => {
    expect(legalCardsFor(cards('7H AS'), { leader: 0, plays: [] }, H, true, 0)).toHaveLength(2);
  });
  it('must follow suit (non-trump led, no need to beat)', () => {
    expect(legal('7S AS JH', trick(0, 'KS'), H, true)).toEqual(ids(cards('7S AS')));
  });
  it('trump led: must beat if possible', () => {
    expect(legal('7H AH JH 7S', trick(0, '9H'), H, true)).toEqual(['JH']);
    expect(legal('7H 8H 7S', trick(0, '9H'), H, true)).toEqual(['7H', '8H']);
  });
  it('trump led: must beat even if partner holds the trick', () => {
    expect(legal('7H JH', trick(0, '9H 10H'), H, true)).toEqual(['JH']);
  });
  it('void, opponent winning: must trump', () => {
    expect(legal('7H QH AC', trick(0, 'AS'), H, true)).toEqual(['7H', 'QH']);
  });
  it('void, opponent trumped: must overtrump if possible', () => {
    expect(legal('7H AH AC', trick(0, 'AS QH'), H, true)).toEqual(['AH']);
  });
  it('void, opponent trumped, cannot overtrump: anything', () => {
    expect(legal('7H 8H AC', trick(0, 'AS 7S QH'), H, true).length).toBe(3);
  });
  it('void, partner winning: anything', () => {
    expect(legal('7H AC', trick(0, 'AS 7S'), H, true).length).toBe(2);
  });
  it('void, partner trumped and still winning: anything', () => {
    expect(legal('7H AC', trick(1, '7S JH 8S'), H, false).length).toBe(2);
    expect(legal('7H AC', trick(0, 'AS JH'), H, false)).toEqual(['7H']); // opponent trumped → relaxed: any trump
    expect(legal('7H AC', trick(1, '7S QH AS'), H, true).length).toBe(2);
  });
  it('NT: follow suit only; void → anything', () => {
    expect(legal('7S AH', trick(0, 'AS'), NT, true)).toEqual(['7S']);
    expect(legal('7H AH', trick(0, 'AS'), NT, true).length).toBe(2);
  });
  it('AT: must beat highest of led suit', () => {
    expect(legal('7S JS AH', trick(0, '9S'), AT, true)).toEqual(['JS']);
    expect(legal('7S 8S AH', trick(0, '9S'), AT, true)).toEqual(['7S', '8S']);
    expect(legal('7S JS', trick(0, '9S AS'), AT, true)).toEqual(['JS']); // partner winning doesn't matter
    expect(legal('7H AD', trick(0, '9S'), AT, true).length).toBe(2);
  });
});

describe('legal cards — relaxed', () => {
  it('trump led: no need to beat', () => {
    expect(legal('7H AH JH 7S', trick(0, '9H'), H, false)).toEqual(['7H', 'AH', 'JH']);
  });
  it('AT: no need to beat', () => {
    expect(legal('7S JS AH', trick(0, '9S'), AT, false)).toEqual(['7S', 'JS']);
  });
  it('void, opponent winning: must trump, but any trump', () => {
    expect(legal('7H AH AC', trick(0, 'AS QH'), H, false)).toEqual(['7H', 'AH']);
    expect(legal('7H AH AC', trick(0, 'AS'), H, false)).toEqual(['7H', 'AH']);
  });
  it('void, partner winning: anything', () => {
    expect(legal('7H AC', trick(0, 'AS 7S'), H, false).length).toBe(2);
  });
});
