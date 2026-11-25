'use client';
import { useEffect } from 'react';
export function SiteRedirect({ to, label }: { to: string; label: string }) {
  useEffect(() => {
    const target = new URL(to, location.origin);
    if (location.search) target.search = location.search;
    if (location.hash) target.hash = location.hash;
    location.replace(target.href);
  }, [to]);
  return <p className="results-status">Opening {label}… <a href={to}>Continue to {label}</a></p>;
}
