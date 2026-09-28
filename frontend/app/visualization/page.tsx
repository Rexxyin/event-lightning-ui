'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';

export default function VisualizationPage() {
  const [energy, setEnergy] =
    useState(0);

  const [responses, setResponses] =
    useState(0);

  const [bursts, setBursts] =
    useState<
      Array<{
        id: number;
        x: number;
        y: number;
      }>
    >([]);

  const idRef = useRef(0);

  useEffect(() => {
    /*
     * For the MVP, the visualization listens
     * to tap events from this browser context.
     *
     * Later this can be replaced by the
     * aggregated CrowdStats stream.
     */
    const channel =
      'BroadcastChannel' in window
        ? new BroadcastChannel(
            'event-light-show',
          )
        : null;

    const handleTap = (
      event: MessageEvent,
    ) => {
      if (
        event.data?.type !==
        'tap'
      ) {
        return;
      }

      const id =
        ++idRef.current;

      setResponses(
        (value) => value + 1,
      );

      setEnergy(
        (value) =>
          Math.min(
            1,
            value + 0.2,
          ),
      );

      const burst = {
        id,
        x:
          20 +
          Math.random() * 60,
        y:
          20 +
          Math.random() * 60,
      };

      setBursts(
        (value) => [
          ...value.slice(-14),
          burst,
        ],
      );

      window.setTimeout(() => {
        setBursts(
          (value) =>
            value.filter(
              (item) =>
                item.id !== id,
            ),
        );
      }, 900);
    };

    channel?.addEventListener(
      'message',
      handleTap,
    );

    const decay =
      window.setInterval(() => {
        setEnergy(
          (value) =>
            value * 0.91,
        );
      }, 100);

    return () => {
      channel?.removeEventListener(
        'message',
        handleTap,
      );

      channel?.close();

      window.clearInterval(
        decay,
      );
    };
  }, []);

  return (
    <main
      className="response-visualization"
      style={
        {
          '--energy': energy,
        } as React.CSSProperties
      }
    >
      <div className="response-visualization__grid" />

      <div className="response-visualization__glow" />

      <div className="response-visualization__core">
        <div className="response-visualization__core-inner" />

        <div className="response-visualization__rings">
          <span />
          <span />
          <span />
        </div>
      </div>

      {bursts.map(
        (burst) => (
          <div
            key={burst.id}
            className="response-burst"
            style={
              {
                left: `${burst.x}%`,
                top: `${burst.y}%`,
              } as React.CSSProperties
            }
          />
        ),
      )}

      <div className="response-visualization__header">
        <span>
          LIVE RESPONSE
        </span>

        <span className="response-visualization__live">
          LIVE
        </span>
      </div>

      <div className="response-visualization__footer">
        <div>
          <span>
            AUDIENCE ENERGY
          </span>

          <strong>
            {Math.round(
              energy * 100,
            )}
            %
          </strong>
        </div>

        <div>
          <span>
            RESPONSES
          </span>

          <strong>
            {responses}
          </strong>
        </div>
      </div>

      <style jsx>{`
        .response-visualization {
          position: fixed;
          inset: 0;

          overflow: hidden;

          background:
            radial-gradient(
              circle at center,
              rgba(
                190,
                255,
                70,
                calc(
                  0.08 +
                    var(--energy) *
                      0.2
                )
              ),
              transparent 32%
            ),
            #020302;

          color: white;

          isolation: isolate;
        }

        .response-visualization__grid {
          position: absolute;
          inset: -20%;

          background-image:
            linear-gradient(
              rgba(
                190,
                255,
                70,
                0.045
              )
              1px,
              transparent 1px
            ),
            linear-gradient(
              90deg,
              rgba(
                190,
                255,
                70,
                0.045
              )
              1px,
              transparent 1px
            );

          background-size:
            60px 60px;

          transform:
            perspective(700px)
            rotateX(62deg)
            translateY(25%);

          opacity:
            calc(
              0.25 +
                var(--energy) *
                  0.6
            );
        }

        .response-visualization__glow {
          position: absolute;

          left: 50%;
          top: 50%;

          width: 40vw;
          height: 40vw;

          transform:
            translate(
              -50%,
              -50%
            );

          border-radius: 50%;

          background:
            radial-gradient(
              circle,
              rgba(
                190,
                255,
                70,
                calc(
                  0.16 +
                    var(--energy) *
                      0.38
                )
              ),
              transparent 70%
            );

          filter: blur(40px);
        }

        .response-visualization__core {
          position: absolute;

          left: 50%;
          top: 50%;

          width:
            min(
              34vw,
              34vh,
              360px
            );

          aspect-ratio: 1;

          transform:
            translate(
              -50%,
              -50%
            );

          border-radius: 50%;

          background:
            radial-gradient(
              circle at 35% 28%,
              white,
              rgba(
                210,
                255,
                130,
                0.9
              ) 8%,
              rgba(
                190,
                255,
                70,
                0.5
              ) 30%,
              rgba(
                190,
                255,
                70,
                0.08
              ) 58%,
              transparent 72%
            );

          box-shadow:
            0 0
              calc(
                40px +
                  var(--energy) *
                    90px
              )
              rgba(
                190,
                255,
                70,
                0.4
              );

          transform-origin:
            center;

          animation:
            core-pulse
            2s
            ease-in-out
            infinite;
        }

        .response-visualization__core-inner {
          position: absolute;
          inset: 14%;

          border-radius: 50%;

          border:
            1px solid
            rgba(
              255,
              255,
              255,
              0.5
            );

          box-shadow:
            inset 0 0 40px
              rgba(
                255,
                255,
                255,
                0.22
              );
        }

        .response-visualization__rings {
          position: absolute;
          inset: -45%;
        }

        .response-visualization__rings span {
          position: absolute;
          inset: 0;

          border:
            1px solid
            rgba(
              190,
              255,
              70,
              0.24
            );

          border-radius: 50%;

          animation:
            response-ring
            3s
            ease-out
            infinite;
        }

        .response-visualization__rings span:nth-child(2) {
          animation-delay: 1s;
        }

        .response-visualization__rings span:nth-child(3) {
          animation-delay: 2s;
        }

        .response-burst {
          position: absolute;

          width: 8px;
          height: 8px;

          transform:
            translate(
              -50%,
              -50%
            );

          border-radius: 50%;

          background: #dfff9a;

          box-shadow:
            0 0 18px
              rgba(
                190,
                255,
                70,
                0.9
              ),
            0 0 50px
              rgba(
                190,
                255,
                70,
                0.4
              );

          animation:
            response-burst
            900ms
            ease-out
            both;
        }

        .response-visualization__header {
          position: absolute;

          left: 28px;
          right: 28px;
          top: 28px;

          display: flex;
          justify-content:
            space-between;

          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;

          font-size: 10px;

          letter-spacing:
            0.2em;

          color:
            rgba(
              255,
              255,
              255,
              0.5
            );
        }

        .response-visualization__live {
          color: #dfff9a;
        }

        .response-visualization__footer {
          position: absolute;

          left: 28px;
          right: 28px;
          bottom: 28px;

          display: flex;
          justify-content:
            space-between;

          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;
        }

        .response-visualization__footer div {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .response-visualization__footer span {
          font-size: 8px;

          letter-spacing:
            0.16em;

          color:
            rgba(
              255,
              255,
              255,
              0.35
            );
        }

        .response-visualization__footer strong {
          font-size: 24px;

          font-weight: 400;

          letter-spacing:
            -0.04em;

          color: #dfff9a;
        }

        @keyframes core-pulse {
          0%,
          100% {
            transform:
              translate(
                -50%,
                -50%
              )
              scale(
                calc(
                  1 +
                    var(--energy) *
                      0.08
                )
              );
          }

          50% {
            transform:
              translate(
                -50%,
                -50%
              )
              scale(
                calc(
                  1.04 +
                    var(--energy) *
                      0.18
                )
              );
          }
        }

        @keyframes response-ring {
          0% {
            opacity: 0;
            transform: scale(
              0.35
            );
          }

          15% {
            opacity: 0.75;
          }

          100% {
            opacity: 0;
            transform: scale(
              1
            );
          }
        }

        @keyframes response-burst {
          0% {
            opacity: 1;
            transform:
              translate(
                -50%,
                -50%
              )
              scale(0.2);
          }

          100% {
            opacity: 0;
            transform:
              translate(
                -50%,
                -50%
              )
              scale(9);
          }
        }

        @media (
          prefers-reduced-motion:
            reduce
        ) {
          .response-visualization__core,
          .response-visualization__rings span,
          .response-burst {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}