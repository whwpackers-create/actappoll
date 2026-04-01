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
} from './services/firestore';
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
import { defaultTheme } from './styles/theme';
import type { AppData, Act, Player } from './types';
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
  | 'seasons';

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [menuImgs, setMenuImgs] = useState<Record<string, string>>(() => {
    try {
      const c = localStorage.getItem('actMenuImgCache');
      return c ? JSON.parse(c) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    getMenuImages()
      .then((d) => {
        setMenuImgs(d);
        try {
          localStorage.setItem('actMenuImgCache', JSON.stringify(d));
        } catch {
          // ignore
        }
        if (d['site_logo']) {
          const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
          if (link) link.href = d['site_logo'];
        }
      })
      .catch(() => {});
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
    document.body.style.backgroundImage =
      (theme.bgImage ? 'url(' + theme.bgImage + '),' : '') +
      'repeating-linear-gradient(0deg, transparent 0px, transparent 28px, rgba(255,255,255,' +
      theme.stripeOpacity +
      ') 28px, rgba(255,255,255,' +
      theme.stripeOpacity +
      ') ' +
      (28 + parseInt(theme.stripeWidth || '3')) +
      'px)';
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
    loadAllData().then(async ({ data: d, source }) => {
      setData(d);
      setSrc(source);
      setLoading(false);
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
      {/* MK Wii trophy — fixed center, 3D spin, same opacity/positioning as flag */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div className="trophy-spin" style={{ opacity: 0.34, marginTop: 60 }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 380" width="500" height="665">
            <defs>
              {/* Main cup body — strong off-center radial for 3D depth */}
              <radialGradient id="tgCup" cx="36%" cy="30%" r="68%">
                <stop offset="0%"   stopColor="#fffce0"/>
                <stop offset="18%"  stopColor="#ffe860"/>
                <stop offset="45%"  stopColor="#d49018"/>
                <stop offset="75%"  stopColor="#8a4e04"/>
                <stop offset="100%" stopColor="#3e1a00"/>
              </radialGradient>
              {/* Wing — slightly warmer tone */}
              <radialGradient id="tgWing" cx="58%" cy="42%" r="62%">
                <stop offset="0%"   stopColor="#ffe878"/>
                <stop offset="40%"  stopColor="#c88010"/>
                <stop offset="100%" stopColor="#5a2e00"/>
              </radialGradient>
              {/* Stem — cylindrical left-to-right */}
              <linearGradient id="tgStem" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="#5a2e00"/>
                <stop offset="22%"  stopColor="#b87010"/>
                <stop offset="50%"  stopColor="#ffe060"/>
                <stop offset="78%"  stopColor="#b87010"/>
                <stop offset="100%" stopColor="#5a2e00"/>
              </linearGradient>
              {/* Base — top to bottom */}
              <linearGradient id="tgBase" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stopColor="#d09020"/>
                <stop offset="45%"  stopColor="#9a5e08"/>
                <stop offset="100%" stopColor="#2e1200"/>
              </linearGradient>
              {/* Rim band — bright top */}
              <linearGradient id="tgRim" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stopColor="#fff9c8"/>
                <stop offset="35%"  stopColor="#ffcc30"/>
                <stop offset="100%" stopColor="#9a5e08"/>
              </linearGradient>
              {/* Crown body uses cup gradient */}
              {/* Gem blue */}
              <radialGradient id="tgGemB" cx="35%" cy="28%" r="65%">
                <stop offset="0%"   stopColor="#ffffff"/>
                <stop offset="38%"  stopColor="#80ccff"/>
                <stop offset="100%" stopColor="#1040a8"/>
              </radialGradient>
              {/* Gem red */}
              <radialGradient id="tgGemR" cx="35%" cy="28%" r="65%">
                <stop offset="0%"   stopColor="#ffffff"/>
                <stop offset="38%"  stopColor="#ffaaaa"/>
                <stop offset="100%" stopColor="#a01020"/>
              </radialGradient>
              {/* Star emblem */}
              <radialGradient id="tgStar" cx="40%" cy="35%" r="60%">
                <stop offset="0%"   stopColor="#ffffff"/>
                <stop offset="30%"  stopColor="#fff070"/>
                <stop offset="100%" stopColor="#b07a00"/>
              </radialGradient>
              {/* Glow */}
              <filter id="tgGlow" x="-25%" y="-25%" width="150%" height="150%">
                <feGaussianBlur stdDeviation="5" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              {/* Drop shadow for wings */}
              <filter id="tgShad" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="4" dy="5" stdDeviation="5" floodColor="#2a0e00" floodOpacity="0.55"/>
              </filter>
            </defs>

            {/* ── Base pedestal ── */}
            <rect x="64"  y="328" width="152" height="20" rx="5" fill="url(#tgBase)"/>
            <rect x="76"  y="312" width="128" height="18" rx="4" fill="url(#tgBase)"/>
            {/* Tier rim highlights */}
            <rect x="64"  y="328" width="152" height="4"  rx="2" fill="rgba(255,230,90,0.45)"/>
            <rect x="76"  y="312" width="128" height="4"  rx="2" fill="rgba(255,230,90,0.45)"/>

            {/* ── Stem ── */}
            <rect x="120" y="274" width="40" height="40" rx="9" fill="url(#tgStem)"/>
            {/* Stem highlight stripe */}
            <rect x="128" y="274" width="12" height="40" rx="5" fill="rgba(255,245,130,0.28)"/>

            {/* ── Connector disc ── */}
            <ellipse cx="140" cy="276" rx="56" ry="13" fill="url(#tgBase)"/>
            <ellipse cx="140" cy="273" rx="56" ry="11" fill="url(#tgRim)"/>
            <ellipse cx="130" cy="270" rx="24"  ry="5"  fill="rgba(255,252,190,0.35)"/>

            {/* ── Left wing — behind cup ── */}
            <path d="M 74,108 C 44,96 14,82 8,56 C 2,32 24,22 52,40 C 64,50 70,78 74,108 Z"
              fill="url(#tgWing)" stroke="#9a5e10" strokeWidth="2" filter="url(#tgShad)"/>
            {/* Wing inner highlight */}
            <path d="M 72,104 C 48,92 24,78 18,56 C 14,40 28,34 50,48"
              fill="none" stroke="rgba(255,240,100,0.45)" strokeWidth="2.5"/>
            {/* Wing vein lines */}
            <path d="M 30,62 C 44,82 60,100 72,118"  stroke="#7a4806" strokeWidth="1.8" fill="none" opacity="0.65"/>
            <path d="M 20,54 C 36,76 54,98 70,118"  stroke="#7a4806" strokeWidth="1.2" fill="none" opacity="0.4"/>
            {/* Wing lower portion */}
            <path d="M 74,108 C 46,118 22,130 14,156 C 8,176 24,196 52,196 C 62,196 70,192 74,186"
              fill="url(#tgWing)" stroke="#9a5e10" strokeWidth="2"/>
            <path d="M 72,110 C 48,120 28,132 22,154 C 18,170 28,184 50,188"
              fill="none" stroke="rgba(255,240,100,0.4)" strokeWidth="2"/>
            <path d="M 22,154 C 38,162 58,172 72,180" stroke="#7a4806" strokeWidth="1.5" fill="none" opacity="0.55"/>

            {/* ── Right wing — behind cup ── */}
            <path d="M 206,108 C 236,96 266,82 272,56 C 278,32 256,22 228,40 C 216,50 210,78 206,108 Z"
              fill="url(#tgWing)" stroke="#9a5e10" strokeWidth="2" filter="url(#tgShad)"/>
            <path d="M 208,104 C 232,92 256,78 262,56 C 266,40 252,34 230,48"
              fill="none" stroke="rgba(255,240,100,0.45)" strokeWidth="2.5"/>
            <path d="M 250,62 C 236,82 220,100 208,118" stroke="#7a4806" strokeWidth="1.8" fill="none" opacity="0.65"/>
            <path d="M 260,54 C 244,76 226,98 210,118" stroke="#7a4806" strokeWidth="1.2" fill="none" opacity="0.4"/>
            <path d="M 206,108 C 234,118 258,130 266,156 C 272,176 256,196 228,196 C 218,196 210,192 206,186"
              fill="url(#tgWing)" stroke="#9a5e10" strokeWidth="2"/>
            <path d="M 208,110 C 232,120 252,132 258,154 C 262,170 252,184 230,188"
              fill="none" stroke="rgba(255,240,100,0.4)" strokeWidth="2"/>
            <path d="M 258,154 C 242,162 222,172 208,180" stroke="#7a4806" strokeWidth="1.5" fill="none" opacity="0.55"/>

            {/* ── Main cup body — chalice/vase shape ── */}
            <path d="
              M 72,82
              C 64,108 56,138 54,166
              C 52,192 56,222 72,246
              C 90,264 114,274 140,274
              C 166,274 190,264 208,246
              C 224,222 228,192 226,166
              C 224,138 216,108 208,82 Z"
              fill="url(#tgCup)" filter="url(#tgGlow)"/>

            {/* 3-D highlight — upper-left bright zone */}
            <path d="
              M 72,82
              C 64,108 58,136 58,162
              C 58,180 62,202 72,222
              C 80,238 94,252 110,260
              C 100,248 92,230 88,208
              C 84,184 84,156 88,128
              C 92,104 100,86 110,76 Z"
              fill="rgba(255,252,190,0.16)"/>

            {/* Shadow — right side */}
            <path d="
              M 208,82
              C 216,108 224,138 226,166
              C 228,192 224,222 208,246
              C 200,260 188,268 174,272
              C 192,264 206,246 214,224
              C 222,200 224,170 220,146
              C 216,118 208,94 208,82 Z"
              fill="rgba(40,14,0,0.22)"/>

            {/* ── Rim / cup opening ── */}
            <ellipse cx="140" cy="82" rx="68" ry="22" fill="url(#tgRim)"/>
            {/* Inner cup darkness */}
            <ellipse cx="140" cy="80" rx="60" ry="16" fill="rgba(30,10,0,0.65)"/>
            {/* Rim highlight glint */}
            <ellipse cx="118" cy="74" rx="30" ry="9" fill="rgba(255,254,210,0.32)"/>

            {/* ── Star/sunburst emblem on front ── */}
            {/* 8-pointed star — no face, just decoration */}
            <path d="M 140,144 L 147,162 L 166,162 L 151,174 L 157,194 L 140,182 L 123,194 L 129,174 L 114,162 L 133,162 Z"
              fill="url(#tgStar)" stroke="rgba(180,120,10,0.7)" strokeWidth="1.5" filter="url(#tgGlow)"/>
            {/* Star inner shine */}
            <path d="M 140,150 L 145,163 L 158,163 L 148,171 L 152,184 L 140,177 L 128,184 L 132,171 L 122,163 L 135,163 Z"
              fill="rgba(255,255,200,0.28)"/>

            {/* Decorative band across mid-cup */}
            <path d="M 56,168 C 68,172 100,174 140,174 C 180,174 212,172 224,168"
              stroke="rgba(255,220,60,0.35)" strokeWidth="5" fill="none"/>
            <path d="M 56,168 C 68,172 100,174 140,174 C 180,174 212,172 224,168"
              stroke="rgba(255,250,160,0.2)" strokeWidth="2" fill="none"/>

            {/* ── Crown on top ── */}
            {/* Crown base band */}
            <rect x="80" y="54" width="120" height="30" rx="6" fill="url(#tgCup)"/>
            <rect x="80" y="54" width="120" height="6"  rx="3" fill="rgba(255,238,90,0.55)"/>
            {/* Crown band bottom rim */}
            <rect x="80" y="78" width="120" height="4"  rx="2" fill="rgba(180,100,10,0.5)"/>

            {/* Crown points — 3 spikes */}
            <polygon points="80,56  96,16  112,56"  fill="url(#tgCup)" stroke="#b07010" strokeWidth="2"/>
            <polygon points="114,56 140,8  166,56" fill="url(#tgCup)" stroke="#b07010" strokeWidth="2"/>
            <polygon points="168,56 184,16 200,56"  fill="url(#tgCup)" stroke="#b07010" strokeWidth="2"/>
            {/* Crown point highlight edges */}
            <polygon points="80,56  96,16  112,56"  fill="none" stroke="rgba(255,242,100,0.5)" strokeWidth="1.2"/>
            <polygon points="114,56 140,8  166,56" fill="none" stroke="rgba(255,242,100,0.5)" strokeWidth="1.2"/>
            <polygon points="168,56 184,16 200,56"  fill="none" stroke="rgba(255,242,100,0.5)" strokeWidth="1.2"/>

            {/* Crown gems */}
            <circle cx="96"  cy="28" r="9"  fill="url(#tgGemR)"/>
            <circle cx="140" cy="18" r="11" fill="url(#tgGemB)"/>
            <circle cx="184" cy="28" r="9"  fill="url(#tgGemR)"/>
            {/* Gem glint specular */}
            <circle cx="93"  cy="23" r="3.5" fill="rgba(255,255,255,0.95)"/>
            <circle cx="137" cy="13" r="4"   fill="rgba(255,255,255,0.95)"/>
            <circle cx="181" cy="23" r="3.5" fill="rgba(255,255,255,0.95)"/>
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
            auth={auth}
            onTheme={() => setShowSettings(!showSettings)}
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
          <Chooser setView={(v) => setView(v as View)} />
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
      </main>

      {/* MK Wii-style footer bar */}
      <div style={{ position: 'relative', zIndex: 100 }}>
        {/* Top accent line */}
        <div style={{ height: 3, background: 'linear-gradient(90deg,#1a2a5a 0%,#3a5aaa 40%,#1a2a5a 100%)' }}/>
        <div style={{
          position: 'relative',
          height: 40,
          background: 'linear-gradient(180deg,#12141e 0%,#0a0c14 100%)',
          overflow: 'hidden',
        }}>
          {/* Checker strip — right side, dark blue-grey squares */}
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 180 }}>
            <svg width="180" height="40" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="footChecker" width="13" height="13" patternUnits="userSpaceOnUse">
                  <rect width="6" height="6" fill="rgba(60,80,140,0.55)"/>
                  <rect x="6" width="7" height="6" fill="rgba(20,24,40,0.7)"/>
                  <rect y="6" width="6" height="7" fill="rgba(20,24,40,0.7)"/>
                  <rect x="6" y="6" width="7" height="7" fill="rgba(60,80,140,0.55)"/>
                </pattern>
                <linearGradient id="footFade" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="white" stopOpacity="0"/>
                  <stop offset="45%" stopColor="white" stopOpacity="1"/>
                </linearGradient>
                <mask id="footMask">
                  <rect width="180" height="40" fill="url(#footFade)"/>
                </mask>
              </defs>
              <rect width="180" height="40" fill="url(#footChecker)" mask="url(#footMask)"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
