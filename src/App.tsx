import { useState, useEffect, useCallback } from 'react';
import './styles/global.css';
import {
  loadAllData,
  fsGet,
  fsSet,
  fsDel,
  saveLocal,
  loadLocal,
  gid,
  getMenuImages,
  loadChunkedImage,
} from './services/firestore';
import { imgCacheGetAll, imgCacheGet, imgCacheSet } from './services/imageCache';
import { useAuth } from './hooks/useAuth';
import { Login } from './components/Login';
import { NavBar } from './components/NavBar';
import { Dashboard } from './components/Dashboard';
import { History } from './components/History';
import { Roster } from './components/Roster';
import { Seasons } from './components/Seasons';
import { Analytics } from './components/Analytics';
import { NewAct } from './components/NewAct';
import { ActDetail } from './components/ActDetail';
import { Chooser } from './components/Chooser';
import { Settings } from './components/Settings';
import { SAT } from './components/SAT';
import { Blackjack } from './components/Blackjack';
import { defaultTheme } from './styles/theme';
import type { AppData, Act, Player } from './types';
import { computeStats } from './utils/elo';
import { FONT_HEADER, FONT_BODY } from './styles/theme';

type View =
  | 'dashboard'
  | 'newact'
  | 'actdetail'
  | 'players'
  | 'history'
  | 'chooser'
  | 'analytics'
  | 'sat'
  | 'seasons'
  | 'blackjack';

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [menuImgs, setMenuImgs] = useState<Record<string, string>>({});

  useEffect(() => {
    // Step 1: load IndexedDB cache immediately — no network, instant on mobile
    imgCacheGetAll().then((cached) => {
      if (Object.keys(cached).length > 0) setMenuImgs(cached);
    });

    // Step 2: fetch Firestore metadata + reassemble any chunked images
    getMenuImages().then(async (d) => {
      const merged: Record<string, string> = { ...d };
      const chunkedKeys = Object.keys(d)
        .filter(k => k.startsWith('chunked_') && d[k] === '1')
        .map(k => k.replace('chunked_', ''));

      await Promise.all(
        chunkedKeys.map(async (k) => {
          const miKey = k === 'site_logo' ? 'site_logo' : 'mi_' + k;
          // Check IndexedDB first before hitting Firestore chunks
          const cached = await imgCacheGet(miKey);
          if (cached) {
            merged[miKey] = cached;
          } else {
            const data = await loadChunkedImage(k).catch(() => null);
            if (data) {
              merged[miKey] = data;
              imgCacheSet(miKey, data); // warm the cache
            }
          }
        })
      );

      setMenuImgs(merged);
      // Persist non-image metadata to localStorage, full images to IndexedDB
      const meta: Record<string, string> = {};
      Object.entries(merged).forEach(([k, v]) => {
        if (v.startsWith('data:')) imgCacheSet(k, v);
        else meta[k] = v;
      });
      try { localStorage.setItem('actMenuImgCache', JSON.stringify(meta)); } catch { /* ignore */ }

      if (merged['site_logo']) {
        const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (link) link.href = merged['site_logo'];
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (menuImgs['site_logo']) {
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link) link.href = menuImgs['site_logo'];
    }
  }, [menuImgs]);

  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('actTheme');
      return saved
        ? { ...defaultTheme, ...JSON.parse(saved) }
        : { ...defaultTheme };
    } catch {
      return { ...defaultTheme };
    }
  });

  const updateTheme = useCallback(
    (key: keyof typeof defaultTheme, val: string) => {
      setTheme((prev: typeof defaultTheme) => {
        const nt = { ...prev, [key]: val };
        try {
          const localOnly: Record<string, string> = {};
          (Object.entries(nt) as [string, string][]).forEach(([k, v]) => {
            if (
              typeof k === 'string' &&
              !k.startsWith('mi_') &&
              !k.startsWith('mz_') &&
              !k.startsWith('mp_') &&
              !k.startsWith('mc_') &&
              !k.startsWith('mb_')
            )
              localOnly[k] = v;
          });
          localStorage.setItem('actTheme', JSON.stringify(localOnly));
        } catch {
          // ignore
        }
        return nt;
      });
    },
    []
  );

  const resetTheme = useCallback(() => {
    setTheme({ ...defaultTheme });
    setMenuImgs({});
    try {
      localStorage.removeItem('actTheme');
      localStorage.removeItem('actMenuImgCache');
    } catch {
      // ignore
    }
    try {
      fsSet('config', 'menuImages', {});
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    document.body.style.backgroundColor = theme.bgColor;
    document.body.style.backgroundImage = theme.bgImage ? 'url(' + theme.bgImage + ')' : 'none';
    document.body.style.backgroundAttachment = 'fixed';
    if (theme.bgImage) document.body.style.backgroundSize = 'cover';
  }, [theme]);

  const [data, setData] = useState<AppData>({
    acts: [],
    players: [],
    seasons: [],
    sats: [],
  });
  const [view, setView] = useState<View>('dashboard');
  const [selAct, setSelAct] = useState<string | null>(null);
  const [selSat, setSelSat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [src, setSrc] = useState<'loading' | 'firebase' | 'local'>('loading');
  const auth = useAuth();

  const reload = useCallback(async () => {
    try {
      const [a, p, s, st] = await Promise.all([
        fsGet('acts'),
        fsGet('players'),
        fsGet('seasons'),
        fsGet('sats'),
      ]);
      const nd: AppData = {
        acts: a as Act[],
        players: p as AppData['players'],
        seasons: s as AppData['seasons'],
        sats: st as AppData['sats'],
      };
      setData(nd);
      saveLocal(nd);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    // Show cached data immediately so page renders without waiting for Firebase
    const cached = loadLocal();
    if (cached) {
      setData(cached);
      setSrc('local');
      setLoading(false);
    }

    loadAllData().then(async ({ data: d, source }) => {
      setData(d);
      setSrc(source);
      if (!cached) setLoading(false);
      if (source === 'firebase') {
        let fx = 0;
        for (const act of d.acts) {
          let ch = false;
          const nt = act.teams.map((t) => {
            if (t.members.length === 2 && t.members[0] && t.members[1]) {
              const an =
                t.members[0].split(' ')[0] + ' & ' + t.members[1].split(' ')[0];
              if (t.name !== an) {
                ch = true;
                return { ...t, name: an };
              }
            }
            return t;
          });
          if (ch) {
            const aid = act.id ?? act._id ?? '';
            const dd = { ...act, teams: nt, id: aid };
            delete (dd as Record<string, unknown>)._id;
            try {
              await fsSet('acts', aid, dd);
              fx++;
            } catch {
              // ignore
            }
          }
        }
        for (const act of d.acts) {
          let needsFix = false;
          const sMap: Record<string, string> = {};
          (act.teams ?? []).forEach((t) => {
            if (t.subs)
              t.members.forEach((m, i) => {
                if (t.subs?.[i]) sMap[m] = t.subs[i];
              });
          });
          if (Object.keys(sMap).length > 0 && act.races) {
            const newRaces = act.races.map((r) => ({
              ...r,
              results: r.results.map((res) => {
                if (sMap[res.player]) {
                  needsFix = true;
                  return { ...res, player: sMap[res.player] };
                }
                return res;
              }),
            }));
            if (needsFix) {
              const aid = act.id ?? act._id ?? '';
              const dd3 = { ...act, races: newRaces, id: aid };
              delete (dd3 as Record<string, unknown>)._id;
              try {
                await fsSet('acts', aid, dd3);
                fx++;
              } catch {
                // ignore
              }
            }
          }
        }
        const satMap: Record<string, (typeof d.sats)[0]> = {};
        (d.sats ?? []).forEach((s) => {
          const sid = s.id ?? s._id ?? '';
          if (sid) satMap[sid] = s;
        });
        for (const act of d.acts) {
          if (act.satId && satMap[act.satId]) {
            const sat = satMap[act.satId];
            const rd = act.satRound ?? 0;
            let correctDate: string;
            if (rd === 0) {
              correctDate = sat.date;
            } else {
              const dd = new Date(sat.date + 'T12:00:00');
              dd.setDate(dd.getDate() + (rd === 1 ? 1 : 2));
              correctDate = dd.toISOString().slice(0, 10);
            }
            if (act.date !== correctDate) {
              const aid = act.id ?? act._id ?? '';
              const dd2 = { ...act, date: correctDate, id: aid };
              delete (dd2 as Record<string, unknown>)._id;
              try {
                await fsSet('acts', aid, dd2);
                fx++;
              } catch {
                // ignore
              }
            }
          }
        }
        for (const sat of d.sats ?? []) {
          let sc = false;
          const nh = (sat.heats ?? []).map((h) => {
            const nht = (h.teams ?? []).map((t) => {
              if (
                t.members &&
                t.members.length === 2 &&
                t.members[0] &&
                t.members[1]
              ) {
                const an =
                  t.members[0].split(' ')[0] + ' & ' + t.members[1].split(' ')[0];
                if (t.name !== an) {
                  sc = true;
                  return { ...t, name: an };
                }
              }
              return t;
            });
            const nha = (h.advanced ?? []).map((t) => {
              if (
                t.members &&
                t.members.length === 2 &&
                t.members[0] &&
                t.members[1]
              ) {
                const an =
                  t.members[0].split(' ')[0] + ' & ' + t.members[1].split(' ')[0];
                if (t.name !== an) return { ...t, name: an };
              }
              return t;
            });
            const nhs = (h.scores ?? []).map((s) => {
              const tm = (h.teams ?? []).find((t) => t.name === s.name);
              if (
                tm?.members &&
                tm.members.length === 2
              ) {
                const an =
                  tm.members[0].split(' ')[0] + ' & ' + tm.members[1].split(' ')[0];
                if (s.name !== an) return { ...s, name: an };
              }
              return s;
            });
            return { ...h, teams: nht, advanced: nha, scores: nhs };
          });
          if (sc) {
            const sid = sat.id ?? sat._id ?? '';
            try {
              await fsSet('sats', sid, { ...sat, heats: nh, id: sid });
            } catch {
              // ignore
            }
          }
        }
        if (fx > 0) {
          const [a, p, s, st] = await Promise.all([
            fsGet('acts'),
            fsGet('players'),
            fsGet('seasons'),
            fsGet('sats'),
          ]);
          setData({
            acts: a as Act[],
            players: p as AppData['players'],
            seasons: s as AppData['seasons'],
            sats: st as AppData['sats'],
          });
        }
      }
    });
  }, []);

  const refreshData = useCallback(async () => {
    try {
      const [a, p, s, st] = await Promise.all([
        fsGet('acts'),
        fsGet('players'),
        fsGet('seasons'),
        fsGet('sats'),
      ]);
      const nd: AppData = {
        acts: a as Act[],
        players: p as AppData['players'],
        seasons: s as AppData['seasons'],
        sats: st as AppData['sats'],
      };
      setData(nd);
      saveLocal(nd);
      setToast('Synced! ✓');
    } catch {
      setToast('Sync failed');
    }
    setTimeout(() => setToast(null), 2500);
  }, []);

  const migrateToFirebase = useCallback(async () => {
    const local = loadLocal();
    if (!local) {
      setToast('No local data found');
      setTimeout(() => setToast(null), 2500);
      return;
    }
    let pushed = 0;
    try {
      const fbActs = await fsGet('acts');
      const fbActIds = new Set(fbActs.map((a) => a.id ?? a._id));
      for (const act of local.acts ?? []) {
        const id = act.id ?? act._id ?? gid();
        if (!fbActIds.has(id)) {
          const d = { ...act, id } as Record<string, unknown>;
          delete d._id;
          if (d.grid && !d.gridJson) {
            d.gridJson = JSON.stringify(d.grid);
            delete d.grid;
          }
          if (d.penalties && !d.penaltiesJson) {
            d.penaltiesJson = JSON.stringify(d.penalties);
            delete d.penalties;
          }
          await fsSet('acts', id, d);
          pushed++;
        }
      }
      const fbPlayers = await fsGet('players');
      const fbNames = new Set(fbPlayers.map((p) => p.name));
      for (const p of local.players ?? []) {
        if (!fbNames.has(p.name)) {
          const id = p.id ?? p._id ?? gid();
          const d = { ...p, id, active: p.active !== false };
          delete (d as Record<string, unknown>)._id;
          await fsSet('players', id, d);
          pushed++;
        }
      }
      const fbSeasons = await fsGet('seasons');
      const fbSeasonNames = new Set(fbSeasons.map((s) => s.name));
      for (const s of local.seasons ?? []) {
        if (!fbSeasonNames.has(s.name)) {
          const id = s.id ?? s._id ?? gid();
          const d = { ...s, id };
          delete (d as Record<string, unknown>)._id;
          await fsSet('seasons', id, d);
          pushed++;
        }
      }
      await reload();
      setToast(`Migrated ${pushed} items to Firebase! 🚀`);
    } catch (e) {
      console.error('Migration failed:', e);
      setToast('Migration error — check console');
    }
    setTimeout(() => setToast(null), 2500);
  }, [reload]);

  const ops = {
    addAct: useCallback(
      async (act: Act) => {
        const id = act.id ?? gid();
        const d = { ...act, id };
        delete (d as Record<string, unknown>)._id;
        // Firestore doesn't support undefined values — strip them before saving
        Object.keys(d).forEach((k) => {
          if ((d as Record<string, unknown>)[k] === undefined) {
            delete (d as Record<string, unknown>)[k];
          }
        });
        try {
          await fsSet('acts', id, d);
          await reload();
        } catch (e) {
          console.error(e);
          setData((nd) => ({ ...nd, acts: [...nd.acts, d as Act] }));
          saveLocal({ ...data, acts: [...data.acts, d as Act] });
          setToast('⚠️ Firebase save failed — ACT saved locally only. Check connection.');
          setTimeout(() => setToast(null), 5000);
        }
      },
      [reload, data]
    ),
    deleteAct: useCallback(
      async (id: string) => {
        try {
          await fsDel('acts', id);
        } catch (e) {
          console.error(e);
          setData((nd) => ({
            ...nd,
            acts: nd.acts.filter((a) => (a.id ?? a._id) !== id),
          }));
          saveLocal({
            ...data,
            acts: data.acts.filter((a) => (a.id ?? a._id) !== id),
          });
        }
        for (const sat of data.sats ?? []) {
          const idx = (sat.heats ?? []).findIndex((h) => h.actId === id);
          if (idx >= 0) {
            const newHeats = (sat.heats ?? []).filter((_, i) => i !== idx);
            const sid = sat.id ?? sat._id ?? '';
            try {
              await fsSet('sats', sid, { ...sat, heats: newHeats, id: sid });
            } catch {
              // ignore
            }
          }
        }
        await reload();
      },
      [data, reload]
    ),
    addPlayer: useCallback(
      async (p: AppData['players'][0]) => {
        const id = p.id ?? gid();
        const d = { ...p, id, active: p.active !== false };
        delete (d as Record<string, unknown>)._id;
        try {
          await fsSet('players', id, d);
          await reload();
        } catch (e) {
          console.error(e);
          setData((nd) => ({ ...nd, players: [...nd.players, d] }));
          saveLocal({ ...data, players: [...data.players, d] });
        }
      },
      [reload, data]
    ),
    removePlayer: useCallback(
      async (_: unknown, name: string) => {
        const p = data.players.find((x) => x.name === name);
        const did = p?.id ?? p?._id ?? '';
        if (did)
          try {
            await fsDel('players', did);
            await reload();
          } catch (e) {
            console.error(e);
            setData((nd) => ({
              ...nd,
              players: nd.players.filter((x) => x.name !== name),
            }));
            saveLocal({
              ...data,
              players: data.players.filter((x) => x.name !== name),
            });
          }
      },
      [data, reload]
    ),
    updatePlayer: useCallback(
      async (name: string, updates: Partial<AppData['players'][0]>) => {
        const p = data.players.find((x) => x.name === name);
        if (!p) return;
        const did = p.id ?? p._id ?? gid();
        const d = { ...p, ...updates, id: did };
        delete (d as Record<string, unknown>)._id;
        try {
          await fsSet('players', did, d);
          await reload();
        } catch (e) {
          console.error(e);
          setData((nd) => ({
            ...nd,
            players: nd.players.map((x) =>
              x.name === name ? { ...x, ...updates } : x
            ),
          }));
          saveLocal({
            ...data,
            players: data.players.map((x) =>
              x.name === name ? { ...x, ...updates } : x
            ),
          });
        }
      },
      [data, reload]
    ),
    addSeason: useCallback(
      async (s: AppData['seasons'][0]) => {
        const id = s.id ?? gid();
        const d = { ...s, id };
        delete (d as Record<string, unknown>)._id;
        try {
          await fsSet('seasons', id, d);
          await reload();
        } catch (e) {
          console.error(e);
          setData((nd) => ({
            ...nd,
            seasons: [...(nd.seasons ?? []), d],
          }));
          saveLocal({
            ...data,
            seasons: [...(data.seasons ?? []), d],
          });
        }
      },
      [reload, data]
    ),
    deleteSeason: useCallback(
      async (id: string) => {
        try {
          await fsDel('seasons', id);
          await reload();
        } catch (e) {
          console.error(e);
          setData((nd) => ({
            ...nd,
            seasons: (nd.seasons ?? []).filter((s) => (s.id ?? s._id) !== id),
          }));
          saveLocal({
            ...data,
            seasons: (data.seasons ?? []).filter((s) => (s.id ?? s._id) !== id),
          });
        }
      },
      [data, reload]
    ),
    updateSeason: useCallback(
      async (id: string, updates: Partial<AppData['seasons'][0]>) => {
        const s = (data.seasons ?? []).find((x) => (x.id ?? x._id) === id);
        if (!s) return;
        const d = { ...s, ...updates, id };
        delete (d as Record<string, unknown>)._id;
        try {
          await fsSet('seasons', id, d);
          await reload();
        } catch (e) {
          console.error(e);
          setData((nd) => ({
            ...nd,
            seasons: (nd.seasons ?? []).map((x) =>
              (x.id ?? x._id) === id ? { ...x, ...updates } : x
            ),
          }));
          saveLocal({
            ...data,
            seasons: (data.seasons ?? []).map((x) =>
              (x.id ?? x._id) === id ? { ...x, ...updates } : x
            ),
          });
        }
      },
      [data, reload]
    ),
    addSat: useCallback(
      async (s: AppData['sats'][0]) => {
        const id = s.id ?? gid();
        const d = { ...s, id };
        delete (d as Record<string, unknown>)._id;
        try {
          await fsSet('sats', id, d);
          await reload();
        } catch (e) {
          console.error(e);
        }
      },
      [reload]
    ),
    updateSat: useCallback(
      async (id: string, updates: Partial<AppData['sats'][0]>) => {
        const s = (data.sats ?? []).find((x) => (x.id ?? x._id) === id);
        if (!s) return;
        const d = { ...s, ...updates, id };
        delete (d as Record<string, unknown>)._id;
        try {
          await fsSet('sats', id, d);
          await reload();
        } catch (e) {
          console.error(e);
        }
      },
      [data, reload]
    ),
    deleteSat: useCallback(
      async (id: string) => {
        try {
          await fsDel('sats', id);
          await reload();
        } catch (e) {
          console.error(e);
        }
      },
      [reload]
    ),
    updateAct: useCallback(
      async (id: string, updates: Partial<Act>) => {
        const a = data.acts.find((x) => (x.id ?? x._id) === id);
        if (!a) return;
        const d = { ...a, ...updates, id };
        delete (d as Record<string, unknown>)._id;
        try {
          await fsSet('acts', id, d);
          await reload();
        } catch (e) {
          console.error(e);
          setData((nd) => ({
            ...nd,
            acts: nd.acts.map((x) =>
              (x.id ?? x._id) === id ? { ...x, ...updates } : x
            ),
          }));
          saveLocal({
            ...data,
            acts: data.acts.map((x) =>
              (x.id ?? x._id) === id ? { ...x, ...updates } : x
            ),
          });
        }
      },
      [data, reload]
    ),
    fixTeamNames: useCallback(async () => {
      let fixed = 0;
      for (const act of data.acts) {
        const newTeams = act.teams.map((t) => {
          if (t.members.length === 2 && t.members[0] && t.members[1]) {
            const autoName =
              t.members[0].split(' ')[0] + ' & ' + t.members[1].split(' ')[0];
            if (t.name !== autoName) return { ...t, name: autoName };
          }
          return t;
        });
        const changed = newTeams.some((t, i) => t.name !== act.teams[i].name);
        if (changed) {
          const aid = act.id ?? act._id ?? '';
          const d = { ...act, teams: newTeams, id: aid };
          delete (d as Record<string, unknown>)._id;
          try {
            await fsSet('acts', aid, d);
            fixed++;
          } catch (e) {
            console.error(e);
          }
        }
      }
      for (const sat of data.sats ?? []) {
        let satChanged = false;
        const newHeats = (sat.heats ?? []).map((h) => {
          const newT = (h.teams ?? []).map((t) => {
            if (
              t.members &&
              t.members.length === 2 &&
              t.members[0] &&
              t.members[1]
            ) {
              const an =
                t.members[0].split(' ')[0] + ' & ' + t.members[1].split(' ')[0];
              if (t.name !== an) {
                satChanged = true;
                return { ...t, name: an };
              }
            }
            return t;
          });
          const newA = (h.advanced ?? []).map((t) => {
            if (
              t.members &&
              t.members.length === 2 &&
              t.members[0] &&
              t.members[1]
            ) {
              const an =
                t.members[0].split(' ')[0] + ' & ' + t.members[1].split(' ')[0];
              if (t.name !== an) return { ...t, name: an };
            }
            return t;
          });
          const newS = (h.scores ?? []).map((s) => {
            const tm = (h.teams ?? []).find((t) => t.name === s.name);
            if (
              tm?.members &&
              tm.members.length === 2
            ) {
              const an =
                tm.members[0].split(' ')[0] + ' & ' + tm.members[1].split(' ')[0];
              if (s.name !== an) return { ...s, name: an };
            }
            return s;
          });
          return { ...h, teams: newT, advanced: newA, scores: newS };
        });
        if (satChanged) {
          const sid = sat.id ?? sat._id ?? '';
          try {
            await fsSet('sats', sid, { ...sat, heats: newHeats, id: sid });
          } catch {
            // ignore
          }
        }
      }
      await reload();
      return fixed;
    }, [data, reload]),
    renamePlayer: useCallback(
      async (oldName: string, newName: string) => {
        const p = data.players.find((x) => x.name === oldName);
        if (!p) return;
        const did = p.id ?? p._id ?? '';
        await fsSet('players', did, { ...p, name: newName, id: did });
        const rn = (s: string) => (s === oldName ? newName : s);
        for (const act of data.acts) {
          let changed = false;
          const newTeams = act.teams.map((t) => {
            const newMembers = t.members.map((m) => {
              if (m === oldName) { changed = true; return newName; }
              return m;
            });
            const newSubs = (t.subs ?? []).map((m) => {
              if (m === oldName) { changed = true; return newName; }
              return m;
            });
            return { ...t, members: newMembers, subs: newSubs };
          });
          const newRaces = (act.races ?? []).map((r) => ({
            ...r,
            results: r.results.map((x) =>
              x.player === oldName ? { ...x, player: newName } : x
            ),
          }));
          if (changed) {
            const aid = act.id ?? act._id ?? '';
            const d = { ...act, teams: newTeams, races: newRaces, id: aid };
            delete (d as Record<string, unknown>)._id;
            try { await fsSet('acts', aid, d); } catch (e) { console.error(e); }
          }
        }
        for (const sat of data.sats) {
          let changed = false;
          const upd: Record<string, unknown> = {};
          if (sat.roster) {
            upd.roster = sat.roster.map((t) => {
              const nm = t.members.map((m) => { if (m === oldName) { changed = true; return newName; } return m; });
              const ns = (t.subs ?? []).map((m) => { if (m === oldName) { changed = true; return newName; } return m; });
              return { ...t, members: nm, subs: ns };
            });
          }
          if (sat.placements) {
            const np: typeof sat.placements = {};
            for (const [pl, teams] of Object.entries(sat.placements)) {
              np[pl] = (teams ?? []).map((t) => {
                const nm = (t.members ?? []).map((m) => { if (m === oldName) { changed = true; return newName; } return m; });
                const ns = (t.subs ?? []).map((m) => { if (m === oldName) { changed = true; return newName; } return m; });
                return { ...t, members: nm, subs: ns };
              });
            }
            upd.placements = np;
          }
          if (sat.heats) {
            upd.heats = sat.heats.map((h) => ({
              ...h,
              teams: (h.teams ?? []).map((t) => ({ ...t, members: (t.members ?? []).map(rn), subs: (t.subs ?? []).map(rn) })),
              advanced: (h.advanced ?? []).map((t) => { const hadOld = (t.members ?? []).includes(oldName) || (t.subs ?? []).includes(oldName); if (hadOld) changed = true; return { ...t, members: (t.members ?? []).map(rn), subs: (t.subs ?? []).map(rn) }; }),
            }));
          }
          const newTeams = sat.teams.map((t) => {
            const nm = t.members.map((m) => { if (m === oldName) { changed = true; return newName; } return m; });
            const ns = (t.subs ?? []).map((m) => { if (m === oldName) { changed = true; return newName; } return m; });
            return { ...t, members: nm, subs: ns };
          });
          const newRaces = (sat.races ?? []).map((r) => ({ ...r, results: r.results.map((x) => x.player === oldName ? { ...x, player: newName } : x) }));
          if (changed) {
            const sid = sat.id ?? sat._id ?? '';
            const d = { ...sat, ...upd, teams: newTeams, races: newRaces, id: sid };
            delete (d as Record<string, unknown>)._id;
            try { await fsSet('sats', sid, d); } catch (e) { console.error(e); }
          }
        }
        // Update local state immediately so UI reflects change without waiting for reload
        setData((prev) => ({
          ...prev,
          players: prev.players.map((pl) =>
            pl.name === oldName ? { ...pl, name: newName } : pl
          ),
        }));
        reload();
      },
      [data, reload]
    ),
    mergePlayers: useCallback(
      async (fromName: string, toName: string) => {
        // Fetch fresh player list directly from Firestore to get real document IDs
        // (avoids stale closure issues with data)
        const freshPlayers = await fsGet<Player>('players');
        const fromPlayer = freshPlayers.find(
          (x) => x.name === fromName || x.name.toLowerCase() === fromName.toLowerCase()
        );
        if (!fromPlayer) throw new Error(`Player "${fromName}" not found in Firestore (${freshPlayers.length} players loaded)`);
        const fromId = fromPlayer._id; // _id is always the real Firestore doc ID from fsGet

        // Resolve the exact stored toName from fresh data
        const toPlayer = freshPlayers.find(
          (x) => x.name === toName || x.name.toLowerCase() === toName.toLowerCase()
        );
        const resolvedToName = toPlayer?.name ?? toName;

        const rn = (s: string) => (s === fromName ? resolvedToName : s);

        // Update all ACTs: replace fromName → resolvedToName in teams, subs, races
        for (const act of data.acts) {
          let changed = false;
          const newTeams = (act.teams ?? []).map((t) => {
            const newMembers = (t.members ?? []).map((m) => { if (m === fromName) { changed = true; return resolvedToName; } return m; });
            const newSubs = (t.subs ?? []).map((m) => { if (m === fromName) { changed = true; return resolvedToName; } return m; });
            return { ...t, members: newMembers, subs: newSubs };
          });
          const newRaces = (act.races ?? []).map((r) => ({
            ...r,
            results: (r.results ?? []).map((x) => x.player === fromName ? { ...x, player: resolvedToName } : x),
          }));
          if (changed) {
            const aid = act.id ?? act._id ?? '';
            const d = { ...act, teams: newTeams, races: newRaces, id: aid };
            delete (d as Record<string, unknown>)._id;
            try { await fsSet('acts', aid, d); } catch (e) { console.error('act update failed:', e); }
          }
        }

        // Update all SATs: replace fromName → resolvedToName
        for (const sat of data.sats) {
          let changed = false;
          const upd: Record<string, unknown> = {};
          if (sat.roster) {
            upd.roster = sat.roster.map((t) => {
              const nm = t.members.map((m) => { if (m === fromName) { changed = true; return resolvedToName; } return m; });
              const ns = (t.subs ?? []).map((m) => { if (m === fromName) { changed = true; return resolvedToName; } return m; });
              return { ...t, members: nm, subs: ns };
            });
          }
          if (sat.placements) {
            const np: typeof sat.placements = {};
            for (const [pl, teams] of Object.entries(sat.placements)) {
              np[pl] = (teams ?? []).map((t) => {
                const nm = (t.members ?? []).map((m) => { if (m === fromName) { changed = true; return resolvedToName; } return m; });
                const ns = (t.subs ?? []).map((m) => { if (m === fromName) { changed = true; return resolvedToName; } return m; });
                return { ...t, members: nm, subs: ns };
              });
            }
            upd.placements = np;
          }
          if (sat.heats) {
            upd.heats = sat.heats.map((h) => ({
              ...h,
              teams: (h.teams ?? []).map((t) => ({ ...t, members: (t.members ?? []).map(rn), subs: (t.subs ?? []).map(rn) })),
              advanced: (h.advanced ?? []).map((t) => {
                const hadOld = (t.members ?? []).includes(fromName) || (t.subs ?? []).includes(fromName);
                if (hadOld) changed = true;
                return { ...t, members: (t.members ?? []).map(rn), subs: (t.subs ?? []).map(rn) };
              }),
            }));
          }
          const newTeams = (sat.teams ?? []).map((t) => {
            const nm = (t.members ?? []).map((m) => { if (m === fromName) { changed = true; return resolvedToName; } return m; });
            const ns = (t.subs ?? []).map((m) => { if (m === fromName) { changed = true; return resolvedToName; } return m; });
            return { ...t, members: nm, subs: ns };
          });
          const newRaces = (sat.races ?? []).map((r) => ({ ...r, results: (r.results ?? []).map((x) => x.player === fromName ? { ...x, player: resolvedToName } : x) }));
          if (changed) {
            const sid = sat.id ?? sat._id ?? '';
            const d = { ...sat, ...upd, teams: newTeams, races: newRaces, id: sid };
            delete (d as Record<string, unknown>)._id;
            try { await fsSet('sats', sid, d); } catch (e) { console.error('sat update failed:', e); }
          }
        }

        // Delete the "from" player document using the real Firestore doc ID
        await fsDel('players', fromId);
        reload();
      },
      [data, reload]
    ),
  };

  if (loading) {
    return (
      <div
        style={{
          background: '#0a0a0c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48 }}>🏁</div>
          <div
            style={{
              color: '#f0e6d3',
              fontFamily: FONT_HEADER,
              fontSize: 18,
              marginTop: 16,
              letterSpacing: 2,
            }}
          >
            CONNECTING...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'transparent',
        fontFamily: FONT_BODY,
        color: '#c8bfa8',
        position: 'relative',
      }}
    >
      {/* Animated wavy checkered flag background */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <svg style={{ position: 'absolute', width: 0, height: 0 }}>
          <defs>
            <filter id="waveFilter" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
              <feTurbulence type="fractalNoise" baseFrequency="0.008 0.006" numOctaves="1" seed="5" result="noise"/>
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="22" xChannelSelector="R" yChannelSelector="G"/>
            </filter>
          </defs>
        </svg>
        <div className="checker-scroll" style={{
          position: 'absolute', top: '-10%', bottom: '-10%',
          left: '-160px', width: 'calc(100% + 320px)',
          filter: 'url(#waveFilter)',
          background: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'140\' height=\'140\'%3E%3Crect width=\'70\' height=\'70\' fill=\'rgba(255,255,255,0.09)\'/%3E%3Crect x=\'70\' width=\'70\' height=\'70\' fill=\'rgba(0,0,0,0)\'/%3E%3Crect y=\'70\' width=\'70\' height=\'70\' fill=\'rgba(0,0,0,0)\'/%3E%3Crect x=\'70\' y=\'70\' width=\'70\' height=\'70\' fill=\'rgba(255,255,255,0.09)\'/%3E%3C/svg%3E")',
        }}/>
      </div>

      {/* hidden placeholder (trophy removed) */}
      <div style={{ display: 'none' }}>
        <div>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 390" width="490" height="670">
            <defs>
              {/* Cup body — off-center radial for 3D depth */}
              <radialGradient id="tgCup" cx="38%" cy="30%" r="66%">
                <stop offset="0%"   stopColor="#fffce0"/>
                <stop offset="20%"  stopColor="#ffe860"/>
                <stop offset="48%"  stopColor="#d49018"/>
                <stop offset="78%"  stopColor="#8a4e04"/>
                <stop offset="100%" stopColor="#3e1a00"/>
              </radialGradient>
              {/* Ear handle */}
              <linearGradient id="tgHandle" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="#4a2000"/>
                <stop offset="35%"  stopColor="#c07808"/>
                <stop offset="60%"  stopColor="#ffe060"/>
                <stop offset="100%" stopColor="#6a3200"/>
              </linearGradient>
              {/* Stem — cylindrical */}
              <linearGradient id="tgStem" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="#4a2000"/>
                <stop offset="25%"  stopColor="#b07010"/>
                <stop offset="50%"  stopColor="#ffe060"/>
                <stop offset="75%"  stopColor="#b07010"/>
                <stop offset="100%" stopColor="#4a2000"/>
              </linearGradient>
              {/* Rim band */}
              <linearGradient id="tgRim" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stopColor="#fff9c0"/>
                <stop offset="38%"  stopColor="#ffca28"/>
                <stop offset="100%" stopColor="#9a5e08"/>
              </linearGradient>
              {/* Crown */}
              <radialGradient id="tgCrown" cx="36%" cy="28%" r="68%">
                <stop offset="0%"   stopColor="#fff8d0"/>
                <stop offset="28%"  stopColor="#ffd040"/>
                <stop offset="65%"  stopColor="#c07808"/>
                <stop offset="100%" stopColor="#4a2000"/>
              </radialGradient>
              {/* Red base */}
              <radialGradient id="tgBase" cx="50%" cy="30%" r="60%">
                <stop offset="0%"   stopColor="#cc1818"/>
                <stop offset="55%"  stopColor="#8a0808"/>
                <stop offset="100%" stopColor="#3a0000"/>
              </radialGradient>
              {/* Gold base rim */}
              <linearGradient id="tgBaseRim" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stopColor="#e0a020"/>
                <stop offset="100%" stopColor="#8a5008"/>
              </linearGradient>
              {/* Red gem */}
              <radialGradient id="tgGemR" cx="33%" cy="26%" r="65%">
                <stop offset="0%"   stopColor="#ffffff"/>
                <stop offset="32%"  stopColor="#ff7070"/>
                <stop offset="100%" stopColor="#980010"/>
              </radialGradient>
              {/* Red accent band */}
              <linearGradient id="tgAccent" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stopColor="#cc1818"/>
                <stop offset="60%"  stopColor="#7a0606"/>
                <stop offset="100%" stopColor="#3a0000"/>
              </linearGradient>
              {/* Clip path for cup body — used by shading sweep */}
              <clipPath id="tgClip">
                <path d="M 64,88 C 56,118 52,148 54,175 C 56,202 66,238 88,258 C 106,272 122,276 140,276 C 158,276 174,272 192,258 C 214,238 224,202 226,175 C 228,148 224,118 216,88 Z"/>
              </clipPath>
              {/* Glow */}
              <filter id="tgGlow" x="-25%" y="-25%" width="150%" height="150%">
                <feGaussianBlur stdDeviation="4" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            {/* ── Red base ── */}
            <ellipse cx="140" cy="360" rx="62" ry="17" fill="url(#tgBase)"/>
            <ellipse cx="140" cy="356" rx="62" ry="14" fill="url(#tgBase)"/>
            {/* Gold trim ring on base */}
            <ellipse cx="140" cy="342" rx="60" ry="9" fill="url(#tgBaseRim)"/>
            <ellipse cx="140" cy="340" rx="60" ry="7" fill="rgba(255,218,50,0.38)"/>

            {/* ── Stem ── */}
            <rect x="124" y="280" width="32" height="62" rx="7" fill="url(#tgStem)"/>
            <rect x="130" y="280" width="10" height="62" rx="4" fill="rgba(255,242,120,0.25)"/>

            {/* ── Connector disc ── */}
            <ellipse cx="140" cy="282" rx="54" ry="12" fill="url(#tgBaseRim)"/>
            <ellipse cx="140" cy="280" rx="54" ry="10" fill="url(#tgRim)"/>
            <ellipse cx="128" cy="277" rx="24" ry="5"  fill="rgba(255,252,190,0.32)"/>

            {/* ── Red accent band at cup bottom ── */}
            <path d="M 88,258 C 106,272 122,276 140,276 C 158,276 174,272 192,258 L 186,252 C 170,266 156,270 140,270 C 124,270 110,266 94,252 Z"
              fill="url(#tgAccent)"/>

            {/* ── Left ear handle (behind cup) ── */}
            <path d="M 63,130 C 32,126 16,150 20,178 C 24,200 40,214 63,216"
              fill="none" stroke="#b07808" strokeWidth="20" strokeLinecap="round"/>
            <path d="M 63,130 C 34,128 20,152 24,178 C 27,198 42,210 63,212"
              fill="none" stroke="url(#tgHandle)" strokeWidth="16" strokeLinecap="round"/>
            {/* Handle highlight */}
            <path d="M 63,134 C 40,132 28,154 30,178 C 32,196 44,206 63,210"
              fill="none" stroke="rgba(255,238,90,0.3)" strokeWidth="5" strokeLinecap="round"/>

            {/* ── Right ear handle (behind cup) ── */}
            <path d="M 217,130 C 248,126 264,150 260,178 C 256,200 240,214 217,216"
              fill="none" stroke="#b07808" strokeWidth="20" strokeLinecap="round"/>
            <path d="M 217,130 C 246,128 260,152 256,178 C 253,198 238,210 217,212"
              fill="none" stroke="url(#tgHandle)" strokeWidth="16" strokeLinecap="round"/>
            <path d="M 217,134 C 240,132 252,154 250,178 C 248,196 236,206 217,210"
              fill="none" stroke="rgba(255,238,90,0.3)" strokeWidth="5" strokeLinecap="round"/>

            {/* ── Main cup body ── */}
            <path d="M 64,88 C 56,118 52,148 54,175 C 56,202 66,238 88,258 C 106,272 122,276 140,276 C 158,276 174,272 192,258 C 214,238 224,202 226,175 C 228,148 224,118 216,88 Z"
              fill="url(#tgCup)" filter="url(#tgGlow)"/>

            {/* Static shadow — right side */}
            <path d="M 216,88 C 224,118 228,148 226,175 C 224,202 214,238 192,258 C 182,266 170,272 158,274 C 178,268 198,248 210,222 C 220,198 224,170 222,146 C 220,120 216,96 216,88 Z"
              fill="rgba(40,14,0,0.20)"/>

            {/* ── Animated shine sweep (simulates rotation) ── */}
            <g clipPath="url(#tgClip)">
              <ellipse cx="140" cy="180" rx="52" ry="105" fill="rgba(255,252,200,0.20)">
                <animateTransform attributeName="transform" type="translate"
                  values="-100,0; 100,0; -100,0" dur="7s" repeatCount="indefinite"
                  calcMode="spline" keySplines="0.42 0 0.58 1; 0.42 0 0.58 1" keyTimes="0;0.5;1"/>
              </ellipse>
            </g>

            {/* ── Cup rim ── */}
            <ellipse cx="140" cy="88" rx="76" ry="22" fill="url(#tgRim)"/>
            {/* Inner cup darkness */}
            <ellipse cx="140" cy="86" rx="68" ry="16" fill="rgba(22,8,0,0.68)"/>
            {/* Rim glint */}
            <ellipse cx="114" cy="82" rx="32" ry="9" fill="rgba(255,254,210,0.28)"/>

            {/* ── Crown base band ── */}
            <rect x="82" y="54" width="116" height="36" rx="6" fill="url(#tgCrown)"/>
            <rect x="82" y="54" width="116" height="6"  rx="3" fill="rgba(255,238,90,0.55)"/>
            <rect x="82" y="84" width="116" height="4"  rx="2" fill="rgba(150,70,8,0.55)"/>

            {/* ── Crown points (5 spikes) ── */}
            <polygon points="82,56  93,20  104,56"  fill="url(#tgCrown)" stroke="#b07010" strokeWidth="1.8"/>
            <polygon points="107,56 120,10 133,56" fill="url(#tgCrown)" stroke="#b07010" strokeWidth="1.8"/>
            <polygon points="126,56 140,6  154,56" fill="url(#tgCrown)" stroke="#b07010" strokeWidth="1.8"/>
            <polygon points="147,56 160,10 173,56" fill="url(#tgCrown)" stroke="#b07010" strokeWidth="1.8"/>
            <polygon points="176,56 187,20 198,56"  fill="url(#tgCrown)" stroke="#b07010" strokeWidth="1.8"/>
            {/* Crown highlight edges */}
            <polygon points="82,56  93,20  104,56"  fill="none" stroke="rgba(255,240,100,0.48)" strokeWidth="1"/>
            <polygon points="107,56 120,10 133,56" fill="none" stroke="rgba(255,240,100,0.48)" strokeWidth="1"/>
            <polygon points="126,56 140,6  154,56" fill="none" stroke="rgba(255,240,100,0.48)" strokeWidth="1"/>
            <polygon points="147,56 160,10 173,56" fill="none" stroke="rgba(255,240,100,0.48)" strokeWidth="1"/>
            <polygon points="176,56 187,20 198,56"  fill="none" stroke="rgba(255,240,100,0.48)" strokeWidth="1"/>

            {/* ── Crown gems — all red like the image ── */}
            <circle cx="93"  cy="26" r="8.5" fill="url(#tgGemR)"/>
            <circle cx="120" cy="16" r="8.5" fill="url(#tgGemR)"/>
            <circle cx="140" cy="12" r="9.5" fill="url(#tgGemR)"/>
            <circle cx="160" cy="16" r="8.5" fill="url(#tgGemR)"/>
            <circle cx="187" cy="26" r="8.5" fill="url(#tgGemR)"/>
            {/* Gem specular */}
            <circle cx="90"  cy="21" r="3"   fill="rgba(255,255,255,0.92)"/>
            <circle cx="117" cy="11" r="3"   fill="rgba(255,255,255,0.92)"/>
            <circle cx="137" cy="7"  r="3.5" fill="rgba(255,255,255,0.92)"/>
            <circle cx="157" cy="11" r="3"   fill="rgba(255,255,255,0.92)"/>
            <circle cx="184" cy="21" r="3"   fill="rgba(255,255,255,0.92)"/>
          </svg>
        </div>
      </div>

      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#e94560',
            color: '#fff',
            padding: '10px 24px',
            borderRadius: 8,
            fontFamily: FONT_HEADER,
            fontSize: 15,
            letterSpacing: 1,
            zIndex: 1000,
            boxShadow: '0 8px 32px rgba(233,69,96,0.4)',
          }}
        >
          {toast}
        </div>
      )}
      {auth.show && <Login auth={auth} />}
      <NavBar
        view={view}
        setView={(v) => setView(v as View)}
        ct={data.acts.length}
        auth={auth}
        src={src}
        onSync={refreshData}
        onMigrate={migrateToFirebase}
        onTheme={() => setShowSettings(s => !s)}
        menuImgs={menuImgs}
      />
      <main
        className="app-main"
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '16px',
          minHeight: 'calc(100vh - 62px)',
        }}
      >
        {showSettings && (
          <Settings
            theme={theme}
            updateTheme={updateTheme}
            resetTheme={resetTheme}
            menuImgs={menuImgs}
            setMenuImgs={setMenuImgs}
            onClose={() => setShowSettings(false)}
          />
        )}
        {view === 'dashboard' && (
          <Dashboard
            data={data}
            setView={(v) => setView(v as View)}
            setSelAct={setSelAct}
            setSelSat={setSelSat}
            menuImgs={menuImgs}
          />
        )}
        {view === 'newact' && (
          <NewAct
            data={data}
            ops={ops}
            setView={(v) => setView(v as View)}
            showToast={(msg) => {
              setToast(msg);
              setTimeout(() => setToast(null), 2500);
            }}
            setSelAct={setSelAct}
          />
        )}
        {view === 'actdetail' && selAct && (
          <ActDetail
            act={data.acts.find((a) => (a.id ?? a._id) === selAct)}
            data={data}
            setView={(v) => setView(v as View)}
            ops={ops}
            showToast={(msg) => {
              setToast(msg);
              setTimeout(() => setToast(null), 2500);
            }}
            auth={auth}
          />
        )}
        {view === 'players' && (
          <Roster
            data={data}
            ops={ops}
            showToast={(msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); }}
            auth={auth}
            setView={(v) => setView(v as View)}
          />
        )}
        {view === 'history' && (
          <History
            data={data}
            setView={(v) => setView(v as View)}
            setSelAct={setSelAct}
            ops={ops}
            showToast={(msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); }}
            auth={auth}
          />
        )}
        {view === 'chooser' && (
          <Chooser setView={(v) => setView(v as View)} data={data} stats={computeStats(data.players, data.acts, data.sats ?? [], data.seasons)} />
        )}
        {view === 'analytics' && (
          <Analytics
            data={data}
            setView={(v) => setView(v as View)}
          />
        )}
        {view === 'sat' && (
          <SAT
            data={data}
            ops={ops}
            showToast={(msg) => {
              setToast(msg);
              setTimeout(() => setToast(null), 2500);
            }}
            auth={auth}
            setView={(v) => setView(v as View)}
            setSelAct={setSelAct}
            selSat={selSat}
            setSelSat={setSelSat}
          />
        )}
        {view === 'seasons' && (
          <Seasons
            data={data}
            ops={ops}
            showToast={(msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); }}
            auth={auth}
            setView={(v) => setView(v as View)}
            menuImgs={menuImgs}
          />
        )}
        {view === 'blackjack' && <Blackjack menuImgs={menuImgs} />}
      </main>

      {/* Footer — mirrors navbar style: white + blue line + light blue checkers */}
      <div style={{ position: 'relative', zIndex: 100 }}>
        {/* Blue border on top */}
        <div style={{ height: 3, background: '#4a6ade' }}/>
        <div style={{ height: 1, background: '#2a3aaa' }}/>
        <div style={{
          position: 'relative', height: 40, overflow: 'hidden',
          background: 'repeating-linear-gradient(180deg,#ffffff 0px,#ffffff 3px,#ebebeb 3px,#ebebeb 4px)',
        }}>
          {/* Light blue big checkers — right side, fading in (matches navbar) */}
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 240, overflow: 'hidden' }}>
            <svg width="240" height="40" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="footChecker" width="26" height="26" patternUnits="userSpaceOnUse">
                  <rect width="13" height="13" fill="rgba(180,210,255,0.85)"/>
                  <rect x="13" width="13" height="13" fill="rgba(235,245,255,0.85)"/>
                  <rect y="13" width="13" height="13" fill="rgba(235,245,255,0.85)"/>
                  <rect x="13" y="13" width="13" height="13" fill="rgba(180,210,255,0.85)"/>
                </pattern>
                <linearGradient id="footFade" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%"  stopColor="white" stopOpacity="0"/>
                  <stop offset="45%" stopColor="white" stopOpacity="1"/>
                </linearGradient>
                <mask id="footMask">
                  <rect width="240" height="40" fill="url(#footFade)"/>
                </mask>
              </defs>
              <rect width="240" height="40" fill="url(#footChecker)" mask="url(#footMask)"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
