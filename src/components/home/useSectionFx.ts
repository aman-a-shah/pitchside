'use client';

/**
 * Home-page scroll choreography — the ONLY entry point for gsap on the
 * home surface, so every section shares one motion vocabulary.
 *
 * Rules encoded here:
 *  - Content is fully visible by default; effects use `gsap.from`, so no-JS,
 *    headless renderers, and reduced-motion users all see the complete page.
 *  - Everything registers inside `gsap.matchMedia` gated on
 *    `(prefers-reduced-motion: no-preference)` — reduced motion gets statics.
 *  - Three primitives only: staggered reveal, scrubbed parallax, scrubbed fill.
 */

import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

let registered = false;

export interface SectionFx {
  /** Stagger the direct children (or a selector's matches) up into place once. */
  revealChildren: (
    el: Element | null,
    opts?: { selector?: string; stagger?: number; y?: number; start?: string }
  ) => void;
  /** Scrubbed vertical drift while the element's parent crosses the viewport. */
  parallax: (el: Element | null, yPercent?: number) => void;
  /** Scrubbed scaleX 0→1 fill across the trigger's scroll range (rails, meters). */
  fillOnScroll: (el: Element | null, trigger?: Element | null) => void;
}

const fx: SectionFx = {
  revealChildren(el, opts = {}) {
    if (!el) return;
    const targets = opts.selector
      ? Array.from(el.querySelectorAll(opts.selector))
      : Array.from(el.children);
    if (targets.length === 0) return;
    gsap.from(targets, {
      y: opts.y ?? 26,
      opacity: 0,
      duration: 0.9,
      ease: 'power3.out',
      stagger: opts.stagger ?? 0.09,
      scrollTrigger: { trigger: el, start: opts.start ?? 'top 78%', once: true },
    });
  },

  parallax(el, yPercent = 6) {
    if (!el) return;
    gsap.fromTo(
      el,
      { yPercent: -yPercent },
      {
        yPercent,
        ease: 'none',
        scrollTrigger: {
          trigger: el.parentElement ?? el,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      }
    );
  },

  fillOnScroll(el, trigger) {
    if (!el) return;
    gsap.fromTo(
      el,
      { scaleX: 0 },
      {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: trigger ?? el,
          start: 'top 75%',
          end: 'bottom 45%',
          scrub: 0.4,
        },
      }
    );
  },
};

export function useSectionFx(setup: (fx: SectionFx) => void) {
  useEffect(() => {
    if (!registered) {
      gsap.registerPlugin(ScrollTrigger);
      registered = true;
    }
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      setup(fx);
    });
    return () => mm.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
