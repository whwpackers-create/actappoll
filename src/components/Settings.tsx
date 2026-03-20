import { fsSet } from '../services/firestore';
import { inp } from '../styles/shared';
import { FONT_HEADER, FONT_MONO } from '../styles/theme';
import type { Theme } from '../styles/theme';

const MENU_KEYS = [
  'newact',
  'history',
  'roster',
  'seasons',
  'sat',
  'chooser',
  'analytics',
  'trophy',
] as const;

const MENU_LABELS: Record<string, string> = {
  newact: 'New ACT',
  history: 'History',
  roster: 'Roster',
  seasons: 'Seasons',
  sat: 'SAT',
  chooser: 'Chooser',
  analytics: 'Elo Analytics',
  trophy: 'Trophy Icon',
};

interface SettingsProps {
  theme: Theme;
  updateTheme: (key: keyof Theme, val: string) => void;
  resetTheme: () => void;
  menuImgs: Record<string, string>;
  setMenuImgs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onClose: () => void;
}

function persistMenuImgs(imgs: Record<string, string>) {
  const fbImages: Record<string, string> = {};
  MENU_KEYS.forEach((k) => {
    if (imgs['mi_' + k]) fbImages['mi_' + k] = imgs['mi_' + k];
    if (imgs['mz_' + k]) fbImages['mz_' + k] = imgs['mz_' + k];
    if (imgs['mp_' + k]) fbImages['mp_' + k] = imgs['mp_' + k];
    if (imgs['mc_' + k]) fbImages['mc_' + k] = imgs['mc_' + k];
    if (imgs['mb_' + k]) fbImages['mb_' + k] = imgs['mb_' + k];
    if (imgs['mx_' + k]) fbImages['mx_' + k] = imgs['mx_' + k];
  });
  fsSet('config', 'menuImages', fbImages);
  try {
    localStorage.setItem('actMenuImgCache', JSON.stringify(fbImages));
  } catch {
    // ignore
  }
}

export function Settings({
  theme,
  updateTheme,
  resetTheme,
  menuImgs,
  setMenuImgs,
  onClose,
}: SettingsProps) {
  const compressAndSet = (key: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img2 = new Image();
      img2.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 400;
        const scale = Math.min(maxW / img2.width, 1);
        canvas.width = img2.width * scale;
        canvas.height = img2.height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img2, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL('image/jpeg', 0.7);
          setMenuImgs((prev) => ({
            ...prev,
            ['mi_' + key]: compressed,
            ['ed_' + key]: 'true',
          }));
        }
      };
      img2.src = (ev.target?.result as string) ?? '';
    };
    reader.readAsDataURL(file);
  };

  const doSave = (key: string) => {
    setMenuImgs((prev) => {
      const n = { ...prev };
      delete n['ed_' + key];
      persistMenuImgs(n);
      return n;
    });
  };

  const doRemove = (key: string) => {
    setMenuImgs((prev) => {
      const n = { ...prev };
      delete n['mi_' + key];
      delete n['mz_' + key];
      delete n['mp_' + key];
      delete n['mc_' + key];
      delete n['mb_' + key];
      delete n['mx_' + key];
      delete n['ed_' + key];
      persistMenuImgs(n);
      return n;
    });
  };

  return (
    <div
      style={{
        maxWidth: 600,
        margin: '0 auto 20px',
        background: 'rgba(12,14,22,0.9)',
        border: '1px solid #2a3040',
        borderRadius: 10,
        padding: 20,
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <span
          style={{
            fontFamily: FONT_HEADER,
            fontSize: 16,
            color: '#fff',
            letterSpacing: 2,
          }}
        >
          🎨 Theme Editor
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={resetTheme}
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              padding: '4px 10px',
              fontSize: 9,
              fontFamily: FONT_MONO,
              color: '#888',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}
      >
        <div>
          <label
            style={{
              fontFamily: FONT_MONO,
              fontSize: 9,
              color: '#667',
              display: 'block',
              marginBottom: 3,
            }}
          >
            Background Color
          </label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="color"
              value={theme.bgColor}
              onChange={(e) => updateTheme('bgColor', e.target.value)}
              style={{
                width: 36,
                height: 28,
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                padding: 0,
              }}
            />
            <input
              style={{ ...inp, fontSize: 11, padding: '4px 8px' }}
              value={theme.bgColor}
              onChange={(e) => updateTheme('bgColor', e.target.value)}
            />
          </div>
        </div>
        <div>
          <label
            style={{
              fontFamily: FONT_MONO,
              fontSize: 9,
              color: '#667',
              display: 'block',
              marginBottom: 3,
            }}
          >
            Accent Color
          </label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="color"
              value={theme.accentColor}
              onChange={(e) => updateTheme('accentColor', e.target.value)}
              style={{
                width: 36,
                height: 28,
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                padding: 0,
              }}
            />
            <input
              style={{ ...inp, fontSize: 11, padding: '4px 8px' }}
              value={theme.accentColor}
              onChange={(e) => updateTheme('accentColor', e.target.value)}
            />
          </div>
        </div>
        <div>
          <label
            style={{
              fontFamily: FONT_MONO,
              fontSize: 9,
              color: '#667',
              display: 'block',
              marginBottom: 3,
            }}
          >
            Stripe Opacity
          </label>
          <input
            type="range"
            min="0"
            max="0.1"
            step="0.005"
            value={theme.stripeOpacity}
            onChange={(e) => updateTheme('stripeOpacity', e.target.value)}
            style={{ width: '100%' }}
          />
          <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#556' }}>
            {theme.stripeOpacity}
          </span>
        </div>
        <div>
          <label
            style={{
              fontFamily: FONT_MONO,
              fontSize: 9,
              color: '#667',
              display: 'block',
              marginBottom: 3,
            }}
          >
            Stripe Width
          </label>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={theme.stripeWidth}
            onChange={(e) => updateTheme('stripeWidth', e.target.value)}
            style={{ width: '100%' }}
          />
          <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#556' }}>
            {theme.stripeWidth}px
          </span>
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label
            style={{
              fontFamily: FONT_MONO,
              fontSize: 9,
              color: '#667',
              display: 'block',
              marginBottom: 3,
            }}
          >
            Background Image URL
          </label>
          <input
            style={{ ...inp, fontSize: 11, padding: '6px 8px' }}
            value={theme.bgImage}
            onChange={(e) => updateTheme('bgImage', e.target.value)}
            placeholder="https://example.com/image.png"
          />
        </div>
        <div>
          <label
            style={{
              fontFamily: FONT_MONO,
              fontSize: 9,
              color: '#667',
              display: 'block',
              marginBottom: 3,
            }}
          >
            Button Border Color
          </label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="color"
              value={theme.buttonBorderColor}
              onChange={(e) => updateTheme('buttonBorderColor', e.target.value)}
              style={{
                width: 36,
                height: 28,
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                padding: 0,
              }}
            />
            <input
              style={{ ...inp, fontSize: 11, padding: '4px 8px' }}
              value={theme.buttonBorderColor}
              onChange={(e) => updateTheme('buttonBorderColor', e.target.value)}
            />
          </div>
        </div>
        <div>
          <label
            style={{
              fontFamily: FONT_MONO,
              fontSize: 9,
              color: '#667',
              display: 'block',
              marginBottom: 3,
            }}
          >
            Header Text Color
          </label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="color"
              value={theme.headerTextColor}
              onChange={(e) => updateTheme('headerTextColor', e.target.value)}
              style={{
                width: 36,
                height: 28,
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                padding: 0,
              }}
            />
            <input
              style={{ ...inp, fontSize: 11, padding: '4px 8px' }}
              value={theme.headerTextColor}
              onChange={(e) => updateTheme('headerTextColor', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          paddingTop: 16,
          marginTop: 16,
        }}
      >
        <div
          style={{
            fontFamily: FONT_HEADER,
            fontSize: 14,
            color: '#e0d080',
            marginBottom: 8,
          }}
        >
          Menu Button Backdrops
        </div>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: '#667',
            marginBottom: 12,
          }}
        >
          Upload images for menu tabs. Images are compressed and saved to
          Firebase.
        </div>
        {MENU_KEYS.map((key) => {
          const img = menuImgs['mi_' + key] ?? '';
          const px = parseInt(menuImgs['mx_' + key] ?? '50') || 50;
          const zm = parseInt(menuImgs['mz_' + key] ?? '100') || 100;
          const py = parseInt(menuImgs['mp_' + key] ?? '50') || 50;
          const ct = parseInt(menuImgs['mc_' + key] ?? '0') || 0;
          const cb = parseInt(menuImgs['mb_' + key] ?? '0') || 0;
          const editing = menuImgs['ed_' + key] === 'true';

          return (
            <div
              key={key}
              style={{
                marginBottom: 8,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 6,
                padding: 10,
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = '#c0a840';
              }}
              onDragLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
              }}
              onDrop={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).style.borderColor =
                  'rgba(255,255,255,0.06)';
                const f = e.dataTransfer.files[0];
                if (f?.type.startsWith('image/')) compressAndSet(key, f);
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontFamily: FONT_HEADER,
                    fontSize: 12,
                    color: '#f0e6d3',
                  }}
                >
                  {MENU_LABELS[key]}
                </span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {img && !editing && (
                    <div
                      style={{
                        width: 40,
                        height: 24,
                        borderRadius: 3,
                        border: '1px solid #444',
                        backgroundImage: `url(${img})`,
                        backgroundSize: zm + '%',
                        backgroundPosition: px + '% ' + py + '%',
                        backgroundRepeat: 'no-repeat',
                      }}
                    />
                  )}
                  {img && !editing && (
                    <button
                      onClick={() =>
                        setMenuImgs((prev) => ({
                          ...prev,
                          ['ed_' + key]: 'true',
                        }))
                      }
                      style={{
                        background: 'none',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: 8,
                        fontFamily: FONT_MONO,
                        color: '#aab',
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>
                  )}
                  {img && (
                    <button
                      onClick={() => doRemove(key)}
                      style={{
                        background: 'none',
                        border: '1px solid rgba(233,69,96,0.2)',
                        borderRadius: 4,
                        padding: '2px 6px',
                        fontSize: 8,
                        fontFamily: FONT_MONO,
                        color: '#e94560',
                        cursor: 'pointer',
                      }}
                    >
                      x
                    </button>
                  )}
                  {!img && (
                    <label
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 4,
                        padding: '3px 8px',
                        fontSize: 8,
                        fontFamily: FONT_MONO,
                        color: '#aab',
                        cursor: 'pointer',
                      }}
                    >
                      Browse
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) compressAndSet(key, f);
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
              {img && editing && (
                <div style={{ marginTop: 6 }}>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontFamily: FONT_MONO,
                          fontSize: 7,
                          color: '#556',
                        }}
                      >
                        Zoom {zm}%
                      </div>
                      <input
                        type="range"
                        min="15"
                        max="400"
                        value={zm}
                        onChange={(e) =>
                          setMenuImgs((prev) => ({
                            ...prev,
                            ['mz_' + key]: e.target.value,
                          }))
                        }
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontFamily: FONT_MONO,
                          fontSize: 7,
                          color: '#556',
                        }}
                      >
                        X-Pos {px}%
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={px}
                        onChange={(e) =>
                          setMenuImgs((prev) => ({
                            ...prev,
                            ['mx_' + key]: e.target.value,
                          }))
                        }
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontFamily: FONT_MONO,
                          fontSize: 7,
                          color: '#556',
                        }}
                      >
                        Y-Pos {py}%
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={py}
                        onChange={(e) =>
                          setMenuImgs((prev) => ({
                            ...prev,
                            ['mp_' + key]: e.target.value,
                          }))
                        }
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontFamily: FONT_MONO,
                          fontSize: 7,
                          color: '#556',
                        }}
                      >
                        Crop Top {ct}%
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="45"
                        value={ct}
                        onChange={(e) =>
                          setMenuImgs((prev) => ({
                            ...prev,
                            ['mc_' + key]: e.target.value,
                          }))
                        }
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontFamily: FONT_MONO,
                          fontSize: 7,
                          color: '#556',
                        }}
                      >
                        Crop Bot {cb}%
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="45"
                        value={cb}
                        onChange={(e) =>
                          setMenuImgs((prev) => ({
                            ...prev,
                            ['mb_' + key]: e.target.value,
                          }))
                        }
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      height: 50,
                      borderRadius: 4,
                      border: '1px solid #333',
                      overflow: 'hidden',
                      position: 'relative',
                      marginBottom: 6,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: '-' + ct + '%',
                        bottom: '-' + cb + '%',
                        left: 0,
                        right: 0,
                        backgroundImage: `url(${img})`,
                        backgroundSize: zm + '%',
                        backgroundPosition: px + '% ' + py + '%',
                        backgroundRepeat: 'no-repeat',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: ct + '%',
                        background: 'rgba(233,69,96,0.15)',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: cb + '%',
                        background: 'rgba(233,69,96,0.15)',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => doSave(key)}
                      style={{
                        flex: 1,
                        padding: '8px 0',
                        background: 'rgba(80,250,123,0.1)',
                        border: '1px solid rgba(80,250,123,0.3)',
                        borderRadius: 4,
                        fontFamily: FONT_HEADER,
                        fontSize: 12,
                        color: '#50fa7b',
                        cursor: 'pointer',
                      }}
                    >
                      Save
                    </button>
                    <label
                      style={{
                        flex: 1,
                        padding: '8px 0',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 4,
                        fontFamily: FONT_HEADER,
                        fontSize: 12,
                        color: '#aab',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      Replace
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) compressAndSet(key, f);
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
