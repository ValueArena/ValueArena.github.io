import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { constLabel } from '@/lib/nicks';
import { valueLogoURL } from '@/lib/value-logos';

export function ValueLogo({ id, size = 24, className = '', priority = false }: {
  id: string; size?: number; className?: string; priority?: boolean;
}) {
  const src = valueLogoURL(id);
  const style = { '--value-logo-size': `${size}px` } as CSSProperties;
  return src
    ? <img className={`value-logo ${className}`} src={src} width={size} height={size} style={style} alt="" decoding="async" fetchPriority={priority ? 'high' : 'auto'} />
    : <svg className={`value-logo value-logo-fallback ${className}`} width={size} height={size} style={style} viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6" /></svg>;
}

export function ValueLabel({ id, children, size = 24 }: { id: string; children?: ReactNode; size?: number }) {
  return <span className="value-label"><ValueLogo id={id} size={size} /><span>{children ?? constLabel(id)}</span></span>;
}

/** Keep the native select's keyboard and touch behavior, with artwork for its selection. */
export function ValueSelect({ value, logoId, className = '', style, ...props }: Omit<ComponentProps<'select'>, 'value'> & { value: string | number; logoId?: string }) {
  const src = valueLogoURL(logoId ?? String(value));
  return <select {...props} value={value} className={`value-select ${className}`} data-has-logo={!!src}
    style={{ ...style, '--selected-value-logo': src ? `url("${src}")` : undefined } as CSSProperties} />;
}
