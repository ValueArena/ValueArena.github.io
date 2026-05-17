import { getModelLogo } from '@/lib/config';

interface Props {
  name: string;
  size?: number;
  className?: string;
}

export function ModelLogo({ name, size = 16, className = '' }: Props) {
  const logo = getModelLogo(name);
  if (!logo) return null;
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={logo}
      width={size}
      height={size}
      alt=""
      className={`model-logo ${className}`}
    />
  );
}

export function ModelSigil({ name }: { name: string }) {
  const logo = getModelLogo(name);
  if (logo) {
    return (
      <div className="specimen-sigil">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" />
      </div>
    );
  }
  // Two-letter monogram fallback.
  const clean = (name || '?').replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  const parts = clean.split(/\s+/);
  const mono =
    parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : clean.slice(0, 2).toUpperCase();
  return <div className="specimen-sigil">{mono}</div>;
}
