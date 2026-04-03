import { useState, useCallback, useEffect } from 'react';
import { FONT_HEADER, FONT_MONO } from '../styles/theme';

// ─── Types ───────────────────────────────────────────────────────────────────
type Suit = '♠' | '♥' | '♦' | '♣';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
interface Card { rank: Rank; suit: Suit; hidden?: boolean }
type Phase = 'bet' | 'player' | 'dealer' | 'done';
type Result = 'win' | 'lose' | 'push' | 'blackjack' | null;

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS: Suit[] = ['♥', '♦'];

function makeDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s });
  return d;
}

function shuffle(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function cardValue(r: Rank): number {
  if (r === 'A') return 11;
  if (['J','Q','K'].includes(r)) return 10;
  return parseInt(r);
}

function handValue(hand: Card[]): number {
  let val = 0, aces = 0;
  for (const c of hand) {
    if (c.hidden) continue;
    val += cardValue(c.rank);
    if (c.rank === 'A') aces++;
  }
  while (val > 21 && aces > 0) { val -= 10; aces--; }
  return val;
}

function isBust(hand: Card[]): boolean { return handValue(hand) > 21; }

// ─── Card Component ──────────────────────────────────────────────────────────
function PlayingCard({ card, small }: { card: Card; small?: boolean }) {
  const isRed = RED_SUITS.includes(card.suit);
  const size = small ? { w: 44, h: 62, font: 13, suitFont: 18 } : { w: 64, h: 90, font: 17, suitFont: 26 };

  if (card.hidden) {
    return (
      <div style={{
        width: size.w, height: size.h, borderRadius: 6,
        border: '2px solid #3a4060',
        background: 'repeating-linear-gradient(135deg,#1e2848 0px,#1e2848 6px,#2a3560 6px,#2a3560 12px)',
        boxShadow: '2px 2px 6px rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {/* MK Wii item box pattern */}
        <div style={{
          width: size.w - 12, height: size.h - 12, borderRadius: 4,
          border: '2px solid rgba(255,200,0,0.4)',
          background: 'rgba(255,200,0,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: small ? 16 : 22, opacity: 0.6 }}>?</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: size.w, height: size.h, borderRadius: 6,
      background: 'linear-gradient(145deg,#f8f6f0 0%,#e8e4d8 100%)',
      border: '2px solid #ccc',
      boxShadow: '2px 2px 8px rgba(0,0,0,0.5)',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', padding: '4px 5px',
      flexShrink: 0, position: 'relative', userSelect: 'none',
    }}>
      <div style={{ fontFamily: FONT_HEADER, fontSize: size.font, fontWeight: 900, color: isRed ? '#c03040' : '#1e2232', lineHeight: 1 }}>
        {card.rank}
      </div>
      <div style={{ fontSize: size.suitFont, color: isRed ? '#c03040' : '#1e2232', textAlign: 'center', lineHeight: 1 }}>
        {card.suit}
      </div>
      <div style={{ fontFamily: FONT_HEADER, fontSize: size.font, fontWeight: 900, color: isRed ? '#c03040' : '#1e2232', lineHeight: 1, alignSelf: 'flex-end', transform: 'rotate(180deg)' }}>
        {card.rank}
      </div>
    </div>
  );
}

// ─── Hand display ────────────────────────────────────────────────────────────
function Hand({ cards, label, value, small }: { cards: Card[]; label: string; value?: number; small?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 2, color: '#888', textTransform: 'uppercase' }}>
        {label}{value !== undefined ? <span style={{ color: value > 21 ? '#c03040' : value === 21 ? '#fbbf24' : '#e2e8f0', marginLeft: 6, fontSize: 13, fontWeight: 700 }}>{value}</span> : null}
      </div>
      <div style={{ display: 'flex', gap: small ? 4 : 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {cards.map((c, i) => <PlayingCard key={i} card={c} small={small} />)}
      </div>
    </div>
  );
}

// ─── Bet chip ────────────────────────────────────────────────────────────────
const CHIP_VALUES = [5, 10, 25, 50, 100];
const CHIP_COLORS: Record<number, { bg: string; border: string; text: string }> = {
  5:   { bg: '#d44', border: '#b22', text: '#fff' },
  10:  { bg: '#4a7ad4', border: '#2a5aaa', text: '#fff' },
  25:  { bg: '#2a9a4a', border: '#1a7a3a', text: '#fff' },
  50:  { bg: '#8a4ad4', border: '#6a2aaa', text: '#fff' },
  100: { bg: '#d4a020', border: '#a07010', text: '#fff' },
};

function Chip({ value, onClick, disabled }: { value: number; onClick: () => void; disabled: boolean }) {
  const c = CHIP_COLORS[value];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 52, height: 52, borderRadius: '50%',
        background: c.bg,
        border: `3px dashed ${c.border}`,
        outline: `2px solid ${c.border}`,
        color: c.text,
        fontFamily: FONT_HEADER,
        fontSize: 13, fontWeight: 900,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        boxShadow: '2px 2px 6px rgba(0,0,0,0.5)',
        transition: 'transform 0.1s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
    >
      {value}
    </button>
  );
}

// ─── Button ──────────────────────────────────────────────────────────────────
function Btn({ label, onClick, disabled, color }: { label: string; onClick: () => void; disabled?: boolean; color?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: FONT_HEADER,
        fontSize: 13,
        fontWeight: 900,
        letterSpacing: 1,
        padding: '8px 20px',
        borderRadius: 4,
        border: `2px solid ${color ?? '#4a6aaa'}`,
        background: disabled ? 'rgba(255,255,255,0.04)' : `rgba(${color ? '200,60,60' : '74,106,170'},0.15)`,
        color: disabled ? '#444' : (color ?? '#a0b4e0'),
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled ? 'none' : '0 2px 6px rgba(0,0,0,0.4)',
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.background = `rgba(${color ? '200,60,60' : '74,106,170'},0.30)`; }}
      onMouseLeave={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.background = `rgba(${color ? '200,60,60' : '74,106,170'},0.15)`; }}
    >
      {label}
    </button>
  );
}

// ─── Result banner ───────────────────────────────────────────────────────────
const RESULT_CFG: Record<NonNullable<Result>, { label: string; sub: string; color: string }> = {
  blackjack: { label: '🏆 BLACKJACK!',   sub: 'Pays 3:2',          color: '#fbbf24' },
  win:       { label: '✅ YOU WIN!',      sub: 'Pays 1:1',          color: '#4aaa6a' },
  push:      { label: '🤝 PUSH',          sub: 'Bet returned',      color: '#a0b0cc' },
  lose:      { label: '💥 BUST / LOSE',   sub: 'Better luck next!', color: '#c03040' },
};

// ─── Settings types ──────────────────────────────────────────────────────────
interface BjSettings {
  startCoins: number;
  deckCount: number;
  minBet: number;
  maxBet: number;
  bjPayout: '3:2' | '6:5';
}
const DEFAULT_SETTINGS: BjSettings = {
  startCoins: 500, deckCount: 2, minBet: 5, maxBet: 500, bjPayout: '3:2',
};

// ─── Main component ──────────────────────────────────────────────────────────
export function Blackjack() {
  const [settings, setSettings] = useState<BjSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingSettings, setPendingSettings] = useState<BjSettings>(DEFAULT_SETTINGS);

  const buildDeck = (count: number) => {
    const decks: Card[] = [];
    for (let i = 0; i < count; i++) decks.push(...makeDeck());
    return shuffle(decks);
  };

  const [deck, setDeck]         = useState<Card[]>(() => buildDeck(DEFAULT_SETTINGS.deckCount));
  const [player, setPlayer]     = useState<Card[]>([]);
  const [dealer, setDealer]     = useState<Card[]>([]);
  const [phase, setPhase]       = useState<Phase>('bet');
  const [coins, setCoins]       = useState(DEFAULT_SETTINGS.startCoins);
  const [bet, setBet]           = useState(0);
  const [result, setResult]     = useState<Result>(null);
  const [msg, setMsg]           = useState('');
  const [doubled, setDoubled]   = useState(false);
  const [history, setHistory]   = useState<{ result: Result; amount: number }[]>([]);

  // Reshuffle when deck runs low
  const ensureDeck = useCallback((d: Card[]) => {
    if (d.length < 15) return buildDeck(settings.deckCount);
    return d;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.deckCount]);

  const addBet = (v: number) => {
    if (phase !== 'bet') return;
    if (bet + v > coins) return;
    if (bet + v > settings.maxBet) return;
    setBet(b => b + v);
  };
  const clearBet = () => { if (phase === 'bet') setBet(0); };

  const deal = useCallback(() => {
    if (bet === 0 || phase !== 'bet') return;
    let d = ensureDeck([...deck]);
    const p: Card[] = [d.pop()!, d.pop()!];
    const de: Card[] = [d.pop()!, { ...d.pop()!, hidden: true }];
    setDeck(d);
    setPlayer(p);
    setDealer(de);
    setDoubled(false);
    setResult(null);
    setMsg('');

    // Check player blackjack immediately
    if (handValue(p) === 21) {
      // Reveal dealer
      const revealed = de.map(c => ({ ...c, hidden: false }));
      const dVal = handValue(revealed);
      if (dVal === 21) {
        setDealer(revealed);
        setPhase('done');
        setResult('push');
        setCoins(c => c); // bet returned
        setHistory(h => [...h, { result: 'push', amount: 0 }]);
        setMsg('Both have Blackjack — push!');
      } else {
        setDealer(revealed);
        setPhase('done');
        setResult('blackjack');
        const bjMult = settings.bjPayout === '3:2' ? 1.5 : 1.2;
        const win = Math.floor(bet * bjMult);
        setCoins(c => c + win);
        setHistory(h => [...h, { result: 'blackjack', amount: win }]);
        setMsg(`Blackjack! +${win} coins (${settings.bjPayout})`);
      }
    } else {
      setPhase('player');
    }
  }, [bet, deck, ensureDeck, phase]);

  const hit = useCallback(() => {
    if (phase !== 'player') return;
    let d = ensureDeck([...deck]);
    const card = d.pop()!;
    const newHand = [...player, card];
    setDeck(d);
    setPlayer(newHand);
    if (isBust(newHand)) {
      setPhase('done');
      setResult('lose');
      setCoins(c => c - bet);
      setHistory(h => [...h, { result: 'lose', amount: -bet }]);
      setMsg(`Bust! -${bet} coins`);
    }
  }, [phase, deck, player, bet, ensureDeck]);

  const doubleDown = useCallback(() => {
    if (phase !== 'player' || player.length !== 2 || bet > coins - bet) return;
    let d = ensureDeck([...deck]);
    const card = d.pop()!;
    const newHand = [...player, card];
    setDeck(d);
    setPlayer(newHand);
    setDoubled(true);
    setBet(b => b * 2);

    if (isBust(newHand)) {
      setPhase('done');
      setResult('lose');
      setCoins(c => c - bet * 2);
      setHistory(h => [...h, { result: 'lose', amount: -bet * 2 }]);
      setMsg(`Doubled & busted! -${bet * 2} coins`);
    } else {
      // Force stand after double
      setPhase('dealer');
    }
  }, [phase, player, deck, bet, coins, ensureDeck]);

  // Dealer plays automatically when phase becomes 'dealer'
  useEffect(() => {
    if (phase !== 'dealer') return;
    const timer = setTimeout(() => {
      let d = ensureDeck([...deck]);
      let dHand: Card[] = dealer.map(c => ({ ...c, hidden: false }));

      // Dealer draws to 17
      while (handValue(dHand) < 17) {
        dHand = [...dHand, d.pop()!];
      }

      const pVal = handValue(player);
      const dVal = handValue(dHand);
      setDeck(d);
      setDealer(dHand);

      let res: Result;
      let delta: number;
      if (isBust(dHand) || pVal > dVal) {
        res = 'win'; delta = bet;
        setCoins(c => c + bet);
        setMsg(`You win! +${bet} coins`);
      } else if (dVal > pVal) {
        res = 'lose'; delta = -bet;
        setCoins(c => c - bet);
        setMsg(`Dealer wins. -${bet} coins`);
      } else {
        res = 'push'; delta = 0;
        setMsg('Push — bet returned.');
      }
      setResult(res);
      setPhase('done');
      setHistory(h => [...h, { result: res, amount: delta }]);
    }, 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const stand = useCallback(() => {
    if (phase !== 'player') return;
    setPhase('dealer');
  }, [phase]);

  const nextRound = () => {
    setPlayer([]);
    setDealer([]);
    setBet(0);
    setResult(null);
    setMsg('');
    setDoubled(false);
    if (coins <= 0) setCoins(settings.startCoins); // rebuy
    setPhase('bet');
  };

  const playerVal = handValue(player);
  const dealerVal = handValue(dealer.map(c => ({ ...c, hidden: false })));
  const visibleDealerVal = handValue(dealer);

  const canHit    = phase === 'player' && !isBust(player);
  const canStand  = phase === 'player';
  const canDouble = phase === 'player' && player.length === 2 && bet <= coins - bet;
  const canDeal   = phase === 'bet' && bet >= settings.minBet;

  const recentHistory = history.slice(-8).reverse();

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 0 40px' }}>

      {/* Header */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(180deg,#12141e 0%,#0e1020 100%)',
        borderRadius: 8, marginBottom: 16, padding: '18px 24px',
        border: '1px solid #2a3060',
        boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
      }}>
        {/* Checker pattern top-right */}
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 120, overflow: 'hidden', opacity: 0.35 }}>
          <svg width="120" height="100" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="bjChecker" width="12" height="12" patternUnits="userSpaceOnUse">
                <rect width="6" height="6" fill="rgba(255,255,255,0.6)"/>
                <rect x="6" width="6" height="6" fill="rgba(160,168,200,0.3)"/>
                <rect y="6" width="6" height="6" fill="rgba(160,168,200,0.3)"/>
                <rect x="6" y="6" width="6" height="6" fill="rgba(255,255,255,0.6)"/>
              </pattern>
            </defs>
            <rect width="120" height="100" fill="url(#bjChecker)"/>
          </svg>
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: FONT_HEADER, fontSize: 22, fontWeight: 900, letterSpacing: 3, color: '#e2e8f0' }}>
              🃏 BLACKJACK
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#5a6a8a', letterSpacing: 2, marginTop: 2 }}>
              MARIO KART WII EDITION · DEALER STANDS ON SOFT 17 · BJ PAYS {settings.bjPayout}
            </div>
          </div>
          <button
            onClick={() => { setPendingSettings(settings); setShowSettings(s => !s); }}
            style={{
              background: 'rgba(255,255,255,0.07)', border: '1px solid #3a4060',
              borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
              fontFamily: FONT_MONO, fontSize: 11, color: '#8090b0',
            }}
          >
            ⚙ SETTINGS
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div style={{
          background: '#0e1020', border: '1px solid #2a3060', borderRadius: 8,
          padding: '20px 24px', marginBottom: 16,
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
        }}>
          <div style={{ fontFamily: FONT_HEADER, fontSize: 13, letterSpacing: 2, color: '#a0b0d0', marginBottom: 16 }}>
            GAME SETTINGS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { label: 'Starting Coins', key: 'startCoins', min: 100, max: 10000, step: 100 },
              { label: 'Min Bet',        key: 'minBet',     min: 1,   max: 500,   step: 1   },
              { label: 'Max Bet',        key: 'maxBet',     min: 10,  max: 10000, step: 10  },
              { label: 'Decks',          key: 'deckCount',  min: 1,   max: 8,     step: 1   },
            ].map(({ label, key, min, max, step }) => (
              <div key={key}>
                <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#5a6a8a', letterSpacing: 1, marginBottom: 4 }}>
                  {label}: <span style={{ color: '#a0c4ff' }}>{pendingSettings[key as keyof BjSettings]}</span>
                </div>
                <input
                  type="range" min={min} max={max} step={step}
                  value={pendingSettings[key as keyof BjSettings] as number}
                  onChange={e => setPendingSettings(s => ({ ...s, [key]: Number(e.target.value) }))}
                  style={{ width: '100%', accentColor: '#4a6ade' }}
                />
              </div>
            ))}
            <div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#5a6a8a', letterSpacing: 1, marginBottom: 6 }}>
                BLACKJACK PAYOUT
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['3:2', '6:5'] as const).map(v => (
                  <button key={v} onClick={() => setPendingSettings(s => ({ ...s, bjPayout: v }))} style={{
                    fontFamily: FONT_MONO, fontSize: 11, padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                    background: pendingSettings.bjPayout === v ? '#4a6ade' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${pendingSettings.bjPayout === v ? '#6a8aee' : '#2a3060'}`,
                    color: pendingSettings.bjPayout === v ? '#fff' : '#6a7a9a',
                  }}>{v}</button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Btn label="APPLY & RESET" onClick={() => {
              setSettings(pendingSettings);
              setDeck(buildDeck(pendingSettings.deckCount));
              setCoins(pendingSettings.startCoins);
              setPlayer([]); setDealer([]); setBet(0);
              setResult(null); setMsg(''); setHistory([]);
              setPhase('bet'); setShowSettings(false);
            }} />
            <Btn label="CANCEL" onClick={() => setShowSettings(false)} color="180,60,60" />
          </div>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'COINS', value: `🪙 ${coins}`, color: '#fbbf24' },
          { label: 'BET',   value: `🎰 ${bet}`,   color: bet > 0 ? '#a0c4ff' : '#4a5a7a' },
          { label: 'HANDS', value: history.length,  color: '#888' },
          { label: 'NET',   value: (history.reduce((s, h) => s + h.amount, 0) >= 0 ? '+' : '') + history.reduce((s, h) => s + h.amount, 0), color: history.reduce((s, h) => s + h.amount, 0) >= 0 ? '#4aaa6a' : '#c03040' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid #2a3060',
            borderRadius: 6, padding: '8px 12px', textAlign: 'center',
          }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#5a6a8a', letterSpacing: 2 }}>{label}</div>
            <div style={{ fontFamily: FONT_HEADER, fontSize: 16, fontWeight: 900, color, marginTop: 2 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{
        background: 'radial-gradient(ellipse at 50% 30%, #1a4a2a 0%, #0d2a18 60%, #091810 100%)',
        border: '3px solid #2a4a3a',
        borderRadius: 12,
        padding: '24px 20px',
        minHeight: 340,
        position: 'relative',
        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.5), 0 4px 20px rgba(0,0,0,0.6)',
        marginBottom: 16,
        display: 'flex', flexDirection: 'column', gap: 24,
      }}>
        {/* Felt texture line */}
        <div style={{
          position: 'absolute', left: 20, right: 20, top: '50%',
          height: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 1,
        }}/>

        {/* Dealer hand */}
        <Hand
          cards={dealer}
          label="DEALER"
          value={phase === 'done' ? dealerVal : visibleDealerVal || undefined}
          small={dealer.length > 4}
        />

        {/* Result banner */}
        {result && (
          <div style={{
            textAlign: 'center',
            background: 'rgba(0,0,0,0.55)',
            borderRadius: 8,
            padding: '10px 20px',
            border: `2px solid ${RESULT_CFG[result].color}`,
            boxShadow: `0 0 20px ${RESULT_CFG[result].color}44`,
          }}>
            <div style={{ fontFamily: FONT_HEADER, fontSize: 20, fontWeight: 900, color: RESULT_CFG[result].color, letterSpacing: 2 }}>
              {RESULT_CFG[result].label}
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#888', marginTop: 4 }}>{msg}</div>
          </div>
        )}

        {/* Player hand */}
        <Hand
          cards={player}
          label="YOU"
          value={player.length > 0 ? playerVal : undefined}
          small={player.length > 4}
        />
      </div>

      {/* Controls */}
      {phase === 'bet' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#5a6a8a', letterSpacing: 2, textAlign: 'center' }}>
            PLACE YOUR BET
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {CHIP_VALUES.map(v => (
              <Chip key={v} value={v} onClick={() => addBet(v)} disabled={bet + v > coins} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Btn label="CLEAR BET" onClick={clearBet} disabled={bet === 0} color="180,60,60" />
            <Btn label="DEAL 🎴" onClick={deal} disabled={!canDeal} />
          </div>
          {coins <= 0 && (
            <div style={{ textAlign: 'center', fontFamily: FONT_MONO, fontSize: 10, color: '#c03040' }}>
              Out of coins — dealing you {settings.startCoins} on the house!
            </div>
          )}
        </div>
      )}

      {phase === 'player' && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Btn label="HIT 🃏"       onClick={hit}        disabled={!canHit}    />
          <Btn label="STAND ✋"     onClick={stand}      disabled={!canStand}  />
          <Btn label="DOUBLE ⬆️"   onClick={doubleDown} disabled={!canDouble} />
        </div>
      )}

      {phase === 'dealer' && (
        <div style={{ textAlign: 'center', fontFamily: FONT_MONO, fontSize: 11, color: '#5a8a6a', letterSpacing: 2 }}>
          {doubled ? 'DOUBLED DOWN — ' : ''}DEALER PLAYING...
        </div>
      )}

      {phase === 'done' && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <Btn label="NEXT ROUND ▶" onClick={nextRound} />
        </div>
      )}

      {/* History */}
      {recentHistory.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#3a4a6a', letterSpacing: 2, marginBottom: 8 }}>
            RECENT HANDS
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {recentHistory.map((h, i) => {
              const cfg = h.result ? RESULT_CFG[h.result] : null;
              return (
                <div key={i} style={{
                  fontFamily: FONT_MONO, fontSize: 9,
                  padding: '3px 8px', borderRadius: 4,
                  border: `1px solid ${cfg?.color ?? '#2a3060'}`,
                  color: cfg?.color ?? '#888',
                  background: 'rgba(0,0,0,0.2)',
                }}>
                  {h.amount > 0 ? '+' : ''}{h.amount}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
