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
        <div className="trophy-spin" style={{ opacity: 0.30, marginTop: 60 }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 340" width="340" height="440">
            <defs>
              {/* Gold gradients */}
              <radialGradient id="tgBody" cx="42%" cy="38%" r="60%">
                <stop offset="0%"   stopColor="#fff5a0"/>
                <stop offset="30%"  stopColor="#ffd340"/>
                <stop offset="65%"  stopColor="#c88010"/>
                <stop offset="100%" stopColor="#7a4800"/>
              </radialGradient>
              <radialGradient id="tgCup" cx="40%" cy="35%" r="58%">
                <stop offset="0%"   stopColor="#fff0a0"/>
                <stop offset="35%"  stopColor="#ffcc30"/>
                <stop offset="70%"  stopColor="#b87010"/>
                <stop offset="100%" stopColor="#6a3800"/>
              </radialGradient>
              <linearGradient id="tgBase" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stopColor="#d49020"/>
                <stop offset="50%"  stopColor="#8a5008"/>
                <stop offset="100%" stopColor="#3a1800"/>
              </linearGradient>
              <linearGradient id="tgStem" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="#7a4808"/>
                <stop offset="40%"  stopColor="#e0a020"/>
                <stop offset="60%"  stopColor="#ffd040"/>
                <stop offset="100%" stopColor="#7a4808"/>
              </linearGradient>
              <radialGradient id="tgWing" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#ffe060"/>
                <stop offset="60%"  stopColor="#c88010"/>
                <stop offset="100%" stopColor="#7a4000"/>
              </radialGradient>
              <radialGradient id="tgEye" cx="50%" cy="40%" r="50%">
                <stop offset="0%"   stopColor="#222"/>
                <stop offset="100%" stopColor="#000"/>
              </radialGradient>
              <radialGradient id="tgGem" cx="40%" cy="30%" r="60%">
                <stop offset="0%"   stopColor="#ffffff"/>
                <stop offset="40%"  stopColor="#a0d8ff"/>
                <stop offset="100%" stopColor="#2060b0"/>
              </radialGradient>
              <radialGradient id="tgGemR" cx="40%" cy="30%" r="60%">
                <stop offset="0%"   stopColor="#ffffff"/>
                <stop offset="40%"  stopColor="#ffb0b0"/>
                <stop offset="100%" stopColor="#c02020"/>
              </radialGradient>
              <filter id="tgGlow">
                <feGaussianBlur stdDeviation="3" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            {/* ── Base pedestal ── */}
            <rect x="82" y="302" width="96" height="14" rx="5" fill="url(#tgBase)"/>
            <rect x="74" y="314" width="112" height="10" rx="4" fill="url(#tgBase)"/>
            <rect x="88" y="289" width="84" height="14" rx="3" fill="url(#tgStem)"/>
            <rect x="84" y="287" width="92" height="5"  rx="2" fill="rgba(255,220,80,0.5)"/>

            {/* ── Stem ── */}
            <rect x="116" y="248" width="28" height="42" rx="6" fill="url(#tgStem)"/>
            <rect x="120" y="248" width="8"  height="42" rx="3" fill="rgba(255,230,100,0.35)"/>

            {/* ── Cup connector disc ── */}
            <ellipse cx="130" cy="250" rx="44" ry="10" fill="url(#tgBase)"/>
            <ellipse cx="130" cy="248" rx="44" ry="8"  fill="url(#tgStem)"/>

            {/* ── Left wing ── */}
            <path d="M 72 190 C 30 168 8 140 18 108 C 28 80 58 88 72 108 Z"
              fill="url(#tgWing)" stroke="#a06010" strokeWidth="1.5"/>
            <path d="M 68 186 C 34 166 18 140 26 116 C 32 100 52 104 64 118 Z"
              fill="rgba(255,220,60,0.3)"/>
            {/* Wing feather lines */}
            <path d="M 38 130 C 50 148 62 162 72 178" stroke="#a06010" strokeWidth="1.2" fill="none" opacity="0.6"/>
            <path d="M 28 120 C 44 140 58 158 68 176" stroke="#a06010" strokeWidth="1"   fill="none" opacity="0.4"/>

            {/* ── Right wing (mirror) ── */}
            <path d="M 188 190 C 230 168 252 140 242 108 C 232 80 202 88 188 108 Z"
              fill="url(#tgWing)" stroke="#a06010" strokeWidth="1.5"/>
            <path d="M 192 186 C 226 166 242 140 234 116 C 228 100 208 104 196 118 Z"
              fill="rgba(255,220,60,0.3)"/>
            <path d="M 222 130 C 210 148 198 162 188 178" stroke="#a06010" strokeWidth="1.2" fill="none" opacity="0.6"/>
            <path d="M 232 120 C 216 140 202 158 192 176" stroke="#a06010" strokeWidth="1"   fill="none" opacity="0.4"/>

            {/* ── Main cup body ── */}
            <ellipse cx="130" cy="175" rx="78" ry="82" fill="url(#tgBody)" filter="url(#tgGlow)"/>
            {/* Body sheen */}
            <ellipse cx="108" cy="138" rx="28" ry="22" fill="rgba(255,255,200,0.18)"/>

            {/* ── Cup opening (top ellipse) ── */}
            <ellipse cx="130" cy="96" rx="58" ry="18" fill="url(#tgCup)"/>
            <ellipse cx="130" cy="93" rx="58" ry="14" fill="rgba(255,240,140,0.25)"/>

            {/* ── Cup rim ── */}
            <path d="M 72 96 C 72 72 188 72 188 96" stroke="#e0a020" strokeWidth="4" fill="none"/>
            <path d="M 74 94 C 74 72 186 72 186 94" stroke="rgba(255,240,100,0.5)" strokeWidth="2" fill="none"/>

            {/* ── Face: eyes ── */}
            <ellipse cx="110" cy="175" rx="14" ry="16" fill="url(#tgEye)"/>
            <ellipse cx="150" cy="175" rx="14" ry="16" fill="url(#tgEye)"/>
            {/* Eye glints */}
            <ellipse cx="115" cy="169" rx="5"  ry="4"  fill="rgba(255,255,255,0.8)"/>
            <ellipse cx="155" cy="169" rx="5"  ry="4"  fill="rgba(255,255,255,0.8)"/>

            {/* ── Smile ── */}
            <path d="M 106 202 Q 130 222 154 202" stroke="#6a3800" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
            <path d="M 108 203 Q 130 220 152 203" stroke="rgba(0,0,0,0.3)" strokeWidth="2" fill="none" strokeLinecap="round"/>

            {/* ── Cheek blush ── */}
            <ellipse cx="96"  cy="195" rx="10" ry="6" fill="rgba(220,80,60,0.28)"/>
            <ellipse cx="164" cy="195" rx="10" ry="6" fill="rgba(220,80,60,0.28)"/>

            {/* ── Front star/diamond emblem ── */}
            <polygon points="130,140 138,158 158,158 142,170 148,188 130,177 112,188 118,170 102,158 122,158"
              fill="url(#tgGem)" stroke="rgba(255,255,255,0.6)" strokeWidth="1"/>

            {/* ── Crown on top ── */}
            {/* Crown base band */}
            <rect x="90" y="56" width="80" height="20" rx="4" fill="url(#tgStem)"/>
            <rect x="90" y="55" width="80" height="5"  rx="2" fill="rgba(255,220,80,0.5)"/>
            {/* Crown points */}
            <polygon points="90,56  102,28 114,56" fill="url(#tgBody)"/>
            <polygon points="118,56 130,22 142,56" fill="url(#tgBody)"/>
            <polygon points="146,56 158,28 170,56" fill="url(#tgBody)"/>
            {/* Crown point outlines */}
            <polygon points="90,56  102,28 114,56" fill="none" stroke="#c08010" strokeWidth="1.5"/>
            <polygon points="118,56 130,22 142,56" fill="none" stroke="#c08010" strokeWidth="1.5"/>
            <polygon points="146,56 158,28 170,56" fill="none" stroke="#c08010" strokeWidth="1.5"/>
            {/* Crown gems */}
            <circle cx="102" cy="36" r="6" fill="url(#tgGemR)"/>
            <circle cx="130" cy="30" r="7" fill="url(#tgGem)"/>
            <circle cx="158" cy="36" r="6" fill="url(#tgGemR)"/>
            {/* Gem glints */}
            <circle cx="100" cy="33" r="2" fill="rgba(255,255,255,0.9)"/>
            <circle cx="128" cy="27" r="2.5" fill="rgba(255,255,255,0.9)"/>
            <circle cx="156" cy="33" r="2" fill="rgba(255,255,255,0.9)"/>
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
