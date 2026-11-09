'use client';

import { useEffect, useState } from 'react';

export function MethodologyContents({ sections }: { sections: string[][] }) {
  const [active, setActive] = useState(sections[0]?.[0]);
  useEffect(() => {
    const targets = sections.map(([id]) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    let frame = 0;
    const update = () => {
      frame = 0;
      const readingLine = 56 + Math.min(160, innerHeight * .2);
      let current = targets[0];
      for (const target of targets) {
        if (target.getBoundingClientRect().top > readingLine) break;
        current = target;
      }
      if (scrollY + innerHeight >= document.documentElement.scrollHeight - 2) current = targets.at(-1) ?? current;
      if (current) setActive(current.id);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    targets.forEach(target => observer.observe(target));
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [sections]);
  return <nav className="methodology-contents" aria-label="On this page"><span>On this page</span>{sections.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={active === id ? 'location' : undefined}>{label}</a>)}</nav>;
}
