'use client';

/**
 * EnginePipeline — "how a match is rebuilt". A genuinely ordered sequence, so
 * the numbered treatment is earned: four steps on one hairline rail that
 * fills as the section scrolls through. Each step carries a mono "specimen"
 * of real system data — the quietly-confident beat of the page.
 */

import { useRef } from 'react';
import { useSectionFx } from './useSectionFx';
import styles from './sections.module.css';

const STEPS = [
  {
    title: 'Events',
    copy: 'Every fixture starts as the real thing: the match’s recorded event stream — thousands of timestamped passes, shots and saves, each with pitch coordinates.',
    specimen: '{ min: 23, player: "Messi",\n  type: "Shot", xG: 0.78 }',
  },
  {
    title: 'Trajectories',
    copy: 'The reconstruction engine turns real events into continuous motion: 22 players and a ball, pinned to every recorded location on a shared clock.',
    specimen: '23+ tracks · 8–15 Hz\nFloat32Array × x·y·z',
  },
  {
    title: 'Physics',
    copy: 'The ball obeys the real thing — gravity, spin, bounce — so a driven shot dips and a clearance hangs.',
    specimen: 'gravity · spin\nbounce restitution',
  },
  {
    title: 'Render',
    copy: 'Stadium, floodlights, and kits are dressed in WebGL and drawn in real time. No prerendered video anywhere.',
    specimen: 'Three.js · WebGL\n60 fps · your GPU',
  },
];

export default function EnginePipeline() {
  const innerRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);
  const stepsRef = useRef<HTMLOListElement>(null);

  useSectionFx((fx) => {
    fx.fillOnScroll(railRef.current, innerRef.current);
    fx.revealChildren(stepsRef.current, { stagger: 0.12 });
  });

  return (
    <section className={styles.engine} aria-label="How a match is rebuilt">
      <div className={styles.engineInner} ref={innerRef}>
        <header className={styles.engineHead}>
          <h2 className={styles.engineTitle}>How a match is rebuilt</h2>
          <p className={styles.engineNote}>events → trajectories → physics → render</p>
        </header>

        <div className={styles.engineRail} aria-hidden>
          <span className={styles.engineRailFill} ref={railRef} />
        </div>

        <ol className={styles.engineSteps} ref={stepsRef}>
          {STEPS.map((s, i) => (
            <li className={styles.engineStep} key={s.title}>
              <span className={styles.engineNum}>{String(i + 1).padStart(2, '0')}</span>
              <h3 className={styles.engineStepTitle}>{s.title}</h3>
              <p className={styles.engineStepCopy}>{s.copy}</p>
              <pre className={styles.engineSpecimen}>{s.specimen}</pre>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
