import { useEffect } from 'react';

/**
 * Scroll-reveal for the landing page. Each section gets its own entrance (blur, slide, zoom, tilt,
 * flip…); card grids, stat strips and FAQ rows stagger child by child. Runs once per element.
 * Nothing is hidden until this runs (`html.reveal-ready`), and prefers-reduced-motion shows
 * everything immediately.
 */
type Effect = 'up' | 'left' | 'right' | 'zoom' | 'blur' | 'tilt' | 'flip' | 'rise';

/** One effect per landing section, in page order: heads use the first, their grids the second. */
const SECTION_EFFECTS: Array<[head: Effect, body: Effect]> = [
  ['blur', 'tilt'], // why
  ['left', 'up'], // how
  ['blur', 'right'], // hardware
  ['left', 'zoom'], // lanes
  ['blur', 'flip'], // guarantees
  ['left', 'rise'], // who
  ['blur', 'up'], // model
  ['left', 'zoom'], // stack
  ['blur', 'left'], // faq
];

const GROUPS = '.lp-cards, .lp-strip, .lp-stack, .lp-chip-row, .grid';

function mark(el: Element, effect: Effect, delay = 0) {
  if (!(el instanceof HTMLElement) || el.dataset.reveal) return;
  el.dataset.reveal = effect;
  if (delay) el.style.setProperty('--reveal-delay', `${delay}ms`);
}

export function useLandingReveal() {
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) return;
    const root = document.querySelector('.lp');
    if (!root) return;

    // hero: plays on load, left column staggered upward, live widget zooms in
    const hero = root.querySelector('.lp-hero');
    if (hero) {
      const [copy, widget] = Array.from(hero.children);
      Array.from(copy?.children ?? []).forEach((c, i) => mark(c, 'up', 80 + i * 110));
      if (widget) mark(widget, 'zoom', 380);
    }
    const strip = root.querySelector('.lp-strip');
    if (strip) Array.from(strip.children).forEach((c, i) => mark(c, 'rise', i * 90));

    root.querySelectorAll('.lp-section').forEach((section, si) => {
      const [headFx, bodyFx] = SECTION_EFFECTS[si % SECTION_EFFECTS.length]!;
      const head = section.querySelector('.lp-section-head');
      if (head) Array.from(head.children).forEach((c, i) => mark(c, headFx, i * 120));
      section.querySelectorAll(GROUPS).forEach((group) => {
        if (group.closest('.lp-section-head')) return;
        Array.from(group.children).forEach((c, i) => mark(c, bodyFx, 60 + Math.min(i, 8) * 90));
      });
      // anything else directly in the section (diagrams, tables, notes, FAQ rows)
      Array.from(section.children).forEach((c, i) => {
        if (c === head || c.matches(GROUPS)) return;
        if (c.classList.contains('lp-faq') || c.tagName === 'DETAILS') return;
        mark(c, bodyFx, 120 + i * 60);
      });
      section.querySelectorAll('details').forEach((d, i) => mark(d, bodyFx, Math.min(i, 8) * 70));
    });
    const cta = root.querySelector('.lp-cta');
    if (cta) mark(cta, 'zoom');

    document.documentElement.classList.add('reveal-ready');
    const pending = new Set(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    const show = (el: Element) => {
      el.classList.add('is-in');
      pending.delete(el as HTMLElement);
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          show(e.target);
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    pending.forEach((el) => io.observe(el));
    // Fallback for browsers/webviews where IntersectionObserver is late or never fires:
    // reveal anything whose top has entered the viewport on scroll/resize.
    let raf = 0;
    const sweep = () => {
      raf = 0;
      const limit = window.innerHeight * 0.94;
      pending.forEach((el) => {
        if (el.getBoundingClientRect().top < limit) show(el);
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(sweep);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    const first = window.setTimeout(sweep, 400);
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.clearTimeout(first);
      if (raf) cancelAnimationFrame(raf);
      document.documentElement.classList.remove('reveal-ready');
    };
  }, []);
}
