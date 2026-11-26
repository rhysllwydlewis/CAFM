/**
 * Shared React components. Class names match design/mockups/src/lib.js 1:1,
 * so a built screen and its mockup share the same CSS.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from 'react';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/** An icon from the design sprite (design/icons/sprite.svg, served at /icons.svg). */
export function Icon({ name, size, label }: { name: string; size?: 14 | 18 | 20 | 24 | 32; label?: string }) {
  return (
    <svg
      className={cx('i', size && `s${size}`)}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <use href={`/icons.svg#i-${name}`} />
    </svg>
  );
}

/** The "FM" in the logomark: outlines of Bodoni Moda Black (SIL OFL 1.1). Kept in step with design/tools/logo.js. */
const LOGO_FM =
  'M29.47 65.41Q28.51 63.26 27.18 61.28Q25.86 59.3 24.13 58.03Q22.4 56.77 20.26 56.77H16.1V55.49H20.26Q22.4 55.49 24.13 54.3Q25.86 53.12 27.18 51.23Q28.51 49.34 29.47 47.2H30.72V65.41ZM39.04 32V45.12H37.76Q36.8 41.7 34.98 39.01Q33.15 36.32 30.5 34.78Q27.84 33.25 24.42 33.25H20.48V78.75H26.88V80H0.93V78.75H6.72V33.25H0.93V32Z M64.54 80.64 46.75 32H60.58L71.36 60.93L81.31 32H82.69L65.95 80.64ZM47.42 32V78.75H52.13V80H41.54V78.75H46.08V33.25H41.18V32ZM100.58 32V33.25H96.06V78.75H100.58V80H77.22V78.75H82.34V32Z';

/** The product logomark ("FM" on a rounded tile, design/icons/logo/logomark.svg). The tile follows the accent colour. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <g transform="translate(16 16) scale(0.2509) translate(-50.75 -56.32)">
        <path fill="#FFFFFF" d={LOGO_FM} />
      </g>
    </svg>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'lg';
  block?: boolean;
  icon?: string;
  ref?: Ref<HTMLButtonElement>;
};

export function Button({
  variant = 'secondary',
  size,
  block,
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('btn', variant, size, block && 'block', !children && 'icon', className)}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error && (
        <span className="field-error" id={`${htmlFor}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & { lg?: boolean; invalid?: boolean; end?: ReactNode };

export function TextInput({ lg, invalid, end, className, ...rest }: TextInputProps) {
  return (
    <div className={cx('input', lg && 'lg', invalid && 'invalid', className)}>
      <input aria-invalid={invalid || undefined} {...rest} />
      {end}
    </div>
  );
}

export function Checkbox({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="row">
      <input type="checkbox" className="cb" {...rest} />
      {label}
    </label>
  );
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}
