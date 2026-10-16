# SAT Rules

The single source of truth for how SATs work on the site. The code follows this file, and
`npm run test:sat` checks the rules below against the real bracket and VR code.
**Run it before every SAT.** If a rule changes, update this file and the dry run together.

Code: `src/utils/satBracket.ts` (bracket, sessions, seeding), `src/utils/VR.ts` (VR),
`src/components/SAT.tsx` (SAT page), `src/components/Dashboard.tsx` (dashboard card).

## Schedule & format — always 4 rounds

| Round | When | Heats | Teams | Sessions |
|---|---|---|---|---|
| Play-in (if needed) | Thursday | 1 | 2–4 | 6:30 |
| Round 1 | Thursday | field ÷ 4 | field | 6:30 / 8:00, split evenly (play-in counts as a 6:30 heat) |
| Round 2 | Friday | **4** | **16** | 6:30 / 8:00, 2 + 2 |
| Semifinals | Saturday morning | **2** | **8** | 11:00 AM |
| Final | Saturday night | **1** | **4** | 8:00 PM |

- `sat.date` is the Thursday (Round 1). Round 2 = +1 day, Semis and Final = +2 days.
- Every heat has exactly 4 teams.

## Play-in

The field must be a multiple of 4. Extra teams play in, and the admin picks the winner
(no results entered, no VR):

| Extra teams | Teams in play-in | Advance |
|---|---|---|
| 1 | 2 | 1 |
| 2 | 4 | 2 |
| 3 | 4 | 1 |

- By default the lowest seeds play in; the admin can pick any teams with an unrated player instead.
- The play-in runs at 6:30; its winner is always placed in an 8:00 Round 1 heat.

## Advancing

- Round 1 sends **3 per heat when 24+ teams entered**, otherwise 2. Every later round sends 2.
- If more teams qualify than the next round holds, the lowest-scoring advancers are cut.
  If fewer, the best remaining finishers fill in (3rd places by points, then 4ths).
- The admin can change how many advance from a single heat (scorecard or ✎ Edit); that heat
  then overrides the default.
- Ties in a heat: the ACT's tiebreaker if set, else the higher original seed. Ties across heats
  when cutting: the higher original seed.
- If a team drops out after advancing, the best team that missed the cut (by points) replaces it.
- The Final is always 4 teams; 1st place is the champion.

## Seeding

- Round 1: teams ranked by average VR, snake-seeded into heats.
- Players who haven't raced have **no VR**; teams with them rank below every fully-rated team
  (fewest unrated first, then by the rated partner's VR).
- Rounds 2+: re-seeded by points scored in the previous round, then snake-seeded.
- Subs never affect seeding.
- Player 1 defaults to the higher-VR player; the admin can swap P1/P2 on the scorecard (teams
  sometimes choose a different order on the night).

## Time requests (admin only)

- A player can need a specific session (6:30 or 8:00) **for one round only** — Round 1 and Round 2
  each have their own list.
- "Optimize Heats" re-snakes the round, moves requested teams into a heat at that session by
  swapping with the closest seed, then rebalances so heats stay even.

## Subs

- Subs are per round (don't carry over), entered in Edit Bracket or on the scorecard.
- A sub earns or loses VR for themselves; the player they replace is unaffected.

## VR in SATs

- Gains are boosted by round: Round 1 1.1×, Round 2 1.2×, Semis 1.5×, Final 2×. Losses are not boosted.
  - Exception: the Fall 2026 SAT used 1.5× every round and 2× in the Final.
- Skill scaling (from 10/15/2026, all ACTs):
  - Favorites earn less for beating much weaker rooms (never less than 25% of a normal gain).
  - Underdogs earn up to 1.5× for upsets and lose less against much stronger rooms.
  - A favorite's losses are never inflated: a good night should never lose VR.
- In SATs, losses are cushioned: half-size at even VR, back to full size only when you're
  300+ VR above the room — i.e. you mostly lose VR in an SAT by being the favorite and flopping.

## Open items

- Duplicate first names in team names should show last initials (e.g. "Graham & Tucker J").
  Deferred until after Fall 2026 so live bracket names don't change mid-event.
- New-player VR (starting value, provisional period) — under discussion.
