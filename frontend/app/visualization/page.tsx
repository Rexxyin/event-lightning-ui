'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

type CrowdStats = {
  totalTaps: number;
  tapsLastSecond: number;
  tapsLast5Seconds: number;
  tapsLast10Seconds: number;
  energy: number;
  activeConnections: number;
  updatedAt: number;
};

type Stats = {
  total: number;
  crowd: CrowdStats;
};

interface Burst {
  id: number;
  x: number;
  y: number;
  power: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export default function VisualizationPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const previousTapTotal = useRef(0);
  const burstId = useRef(0);

  useEffect(() => {
    let disposed = false;

    const poll = async () => {
      try {
        const response = await fetch('/api/stats', { cache: 'no-store' });
        if (!response.ok) return;
        const data = (await response.json()) as Stats;
        if (disposed) return;

        const totalTaps = data.crowd?.totalTaps ?? 0;
        const delta = Math.max(0, totalTaps - previousTapTotal.current);
        previousTapTotal.current = totalTaps;

        if (delta > 0) {
          const count = Math.min(12, Math.max(1, Math.ceil(delta / 2)));
          const nextBursts = Array.from({ length: count }, () => ({
            id: ++burstId.current,
            x: 18 + Math.random() * 64,
            y: 18 + Math.random() * 64,
            power: clamp((delta / Math.max(1, count)) / 6, 0.35, 1),
          }));

          setBursts(current => [...current.slice(-18), ...nextBursts]);
          window.setTimeout(() => {
            const ids = new Set(nextBursts.map(item => item.id));
            setBursts(current => current.filter(item => !ids.has(item.id)));
          }, 1100);
        }

        setStats(data);
      } catch {
        // Keep the visualization alive during transient network failures.
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), 800);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  const energy = clamp((stats?.crowd.energy ?? 0) / 100, 0, 1);
  const tapRate = stats?.crowd.tapsLastSecond ?? 0;
  const connected = stats?.crowd.activeConnections ?? stats?.total ?? 0;
  const rootStyle = {
    '--energy': energy,
    '--rate': tapRate,
  } as CSSProperties;

  return (
    <main className="response-visualization" style={rootStyle}>
      <div className="response-visualization__grid" />
      <div className="response-visualization__vignette" />
      <div className="response-visualization__halo" />
      <div className="response-visualization__core" />

      {bursts.map(burst => (
        <div
          key={burst.id}
          className="response-burst"
          style={
            {
              left: `${burst.x}%`,
              top: `${burst.y}%`,
              '--power': burst.power,
            } as CSSProperties
          }
        >
          <span className="response-burst__ring response-burst__ring--one" />
          <span className="response-burst__ring response-burst__ring--two" />
          <span className="response-burst__core" />
        </div>
      ))}

      <header className="response-visualization__header">
        <div>
          <div className="response-visualization__eyebrow">LIVE CROWD RESPONSE</div>
          <h1>THE AUDIENCE IS THE SHOW</h1>
        </div>
        <div className="response-visualization__live">
          <span /> LIVE
        </div>
      </header>

      <section className="response-visualization__center">
        <div className="response-visualization__percent">{Math.round(energy * 100)}%</div>
        <div className="response-visualization__label">CROWD ENERGY</div>
      </section>

      <footer className="response-visualization__footer">
        <Metric label="TAPS / SEC" value={tapRate} />
        <Metric label="RESPONSES" value={stats?.crowd.totalTaps ?? 0} />
        <Metric label="CONNECTED" value={connected} />
      </footer>

      <style jsx>{`
        .response-visualization {
          --energy: 0;
          --rate: 0;
          position: fixed;
          inset: 0;
          overflow: hidden;
          background:
            radial-gradient(circle at 50% 46%, rgba(190,255,70,calc(.08 + var(--energy) * .26)), transparent 30%),
            #020302;
          color: white;
          isolation: isolate;
          font-family: ui-sans-serif, system-ui, sans-serif;
        }

        .response-visualization__grid {
          position: absolute;
          inset: -20%;
          background-image:
            linear-gradient(rgba(190,255,70,.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(190,255,70,.045) 1px, transparent 1px);
          background-size: 60px 60px;
          transform: perspective(800px) rotateX(63deg) translateY(25%);
          opacity: calc(.24 + var(--energy) * .7);
        }

        .response-visualization__vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle, transparent 30%, rgba(0,0,0,.15) 62%, #000 100%);
          pointer-events: none;
        }

        .response-visualization__halo {
          position: absolute;
          left: 50%;
          top: 50%;
          width: min(62vw,62vh,760px);
          aspect-ratio: 1;
          transform: translate(-50%,-50%);
          border-radius: 50%;
          background: radial-gradient(circle, rgba(190,255,70,calc(.18 + var(--energy) * .5)), transparent 70%);
          filter: blur(42px);
          animation: halo 1.5s ease-in-out infinite alternate;
        }

        .response-visualization__core {
          position: absolute;
          left: 50%;
          top: 50%;
          width: min(28vw,28vh,380px);
          aspect-ratio: 1;
          transform: translate(-50%,-50%) scale(calc(.86 + var(--energy) * .17));
          border-radius: 50%;
          background:
            radial-gradient(circle at 36% 30%, #fff, rgba(255,255,255,.92) 4%, #befe46 13%, rgba(190,255,70,.72) 26%, #081000 70%, #020302 100%);
          box-shadow:
            0 0 35px rgba(190,255,70,.42),
            0 0 140px rgba(190,255,70,calc(.18 + var(--energy) * .42)),
            inset -30px -35px 70px rgba(0,0,0,.75);
          animation: corePulse 900ms ease-in-out infinite;
        }

        .response-burst {
          position: absolute;
          width: 0;
          height: 0;
          z-index: 5;
          pointer-events: none;
        }

        .response-burst__ring,
        .response-burst__core {
          position: absolute;
          left: 0;
          top: 0;
          transform: translate(-50%,-50%);
          border-radius: 50%;
        }

        .response-burst__ring {
          width: calc(110px + 130px * var(--power));
          aspect-ratio: 1;
          border: 2px solid rgba(190,255,70,.75);
          animation: responseRing 1000ms cubic-bezier(.16,.8,.24,1) both;
        }

        .response-burst__ring--two {
          animation-delay: 70ms;
          opacity: .5;
          border-color: rgba(255,255,255,.45);
        }

        .response-burst__core {
          width: calc(14px + 26px * var(--power));
          aspect-ratio: 1;
          background: #fff;
          box-shadow: 0 0 24px #beff46;
          animation: responseCore 650ms ease-out both;
        }

        .response-visualization__header {
          position: absolute;
          inset: 28px 32px auto;
          z-index: 20;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
        }

        .response-visualization__eyebrow,
        .response-visualization__live,
        .response-visualization__label,
        .response-visualization__footer {
          font-family: ui-monospace,SFMono-Regular,Menlo,monospace;
          text-transform: uppercase;
          letter-spacing: .18em;
        }

        .response-visualization__eyebrow {
          font-size: 9px;
          color: rgba(190,255,70,.62);
        }

        h1 {
          margin-top: 8px;
          max-width: 620px;
          font-size: clamp(28px,5vw,68px);
          line-height: .95;
          letter-spacing: -.055em;
          font-weight: 700;
        }

        .response-visualization__live {
          display: flex;
          align-items: center;
          gap: 8px;
          border: 1px solid rgba(190,255,70,.22);
          border-radius: 999px;
          padding: 7px 10px;
          font-size: 9px;
          color: #beff46;
          background: rgba(0,0,0,.24);
          backdrop-filter: blur(12px);
        }

        .response-visualization__live span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #beff46;
          box-shadow: 0 0 10px #beff46;
        }

        .response-visualization__center {
          position: absolute;
          left: 50%;
          top: 50%;
          z-index: 20;
          transform: translate(-50%,-50%);
          text-align: center;
          pointer-events: none;
          text-shadow: 0 8px 36px rgba(0,0,0,.55);
        }

        .response-visualization__percent {
          font-size: clamp(48px,9vw,120px);
          font-weight: 700;
          letter-spacing: -.08em;
        }

        .response-visualization__label {
          margin-top: 6px;
          font-size: 9px;
          color: rgba(255,255,255,.36);
        }

        .response-visualization__footer {
          position: absolute;
          left: 50%;
          bottom: 28px;
          z-index: 20;
          display: grid;
          width: min(92vw,720px);
          grid-template-columns: repeat(3,1fr);
          gap: 1px;
          transform: translateX(-50%);
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.07);
          border-radius: 16px;
          background: rgba(255,255,255,.05);
          backdrop-filter: blur(16px);
        }

        .metric {
          padding: 14px 16px;
          background: rgba(0,0,0,.26);
          text-align: center;
        }

        .metric__label {
          font-size: 8px;
          color: rgba(255,255,255,.25);
        }

        .metric__value {
          margin-top: 4px;
          font-size: 18px;
          color: rgba(255,255,255,.82);
        }

        @keyframes halo {
          from { transform: translate(-50%,-50%) scale(.94); opacity:.72; }
          to { transform: translate(-50%,-50%) scale(calc(1.02 + var(--energy) * .08)); opacity:1; }
        }
        @keyframes corePulse {
          0%,100% { filter: brightness(1); }
          50% { filter: brightness(calc(1 + var(--energy) * .8)); }
        }
        @keyframes responseRing {
          from { opacity: calc(.8 * var(--power)); transform: translate(-50%,-50%) scale(.2); }
          to { opacity:0; transform: translate(-50%,-50%) scale(4.2); }
        }
        @keyframes responseCore {
          from { opacity:1; transform: translate(-50%,-50%) scale(.5); }
          to { opacity:0; transform: translate(-50%,-50%) scale(2.6); }
        }

        @media (max-width: 700px) {
          .response-visualization__header { inset: 18px 18px auto; }
          .response-visualization__footer { bottom: 18px; width: calc(100vw - 28px); }
          .response-visualization__core { width: min(44vw,44vh); }
        }
      `}</style>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <div className="metric__label">{label}</div>
      <div className="metric__value">{value}</div>
    </div>
  );
}
