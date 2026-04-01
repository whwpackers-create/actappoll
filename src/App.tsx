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
      {/* Global checkered flag — fixed behind all content */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <svg viewBox="0 0 420 580" style={{ width: 420, height: 580, opacity: 0.26 }} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="appChecker" width="36" height="36" patternUnits="userSpaceOnUse">
              <rect width="18" height="18" fill="#cccccc"/>
              <rect x="18" width="18" height="18" fill="#181818"/>
              <rect y="18" width="18" height="18" fill="#181818"/>
              <rect x="18" y="18" width="18" height="18" fill="#cccccc"/>
            </pattern>
          </defs>
          {/* Pole */}
          <rect x="28" y="0" width="11" height="580" rx="4" fill="#999"/>
          <rect x="30" y="0" width="4" height="580" rx="2" fill="#bbb"/>
          {/* Flag body */}
          <rect x="39" y="28" width="358" height="230" fill="url(#appChecker)"/>
          {/* Bottom edge shadow for depth */}
          <rect x="39" y="250" width="358" height="8" fill="rgba(0,0,0,0.35)"/>
        </svg>
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
    </div>
  );
}
