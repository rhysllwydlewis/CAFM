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

/** The CAFM logomark (design/icons/logo/logomark.svg). */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <rect x="8" y="8" width="16" height="4" rx="1.5" fill="#FFFFFF" />
      <rect x="8" y="14" width="12" height="4" rx="1.5" fill="#FFFFFF" fillOpacity="0.78" />
      <rect x="8" y="20" width="8" height="4" rx="1.5" fill="#FFFFFF" fillOpacity="0.56" />
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
