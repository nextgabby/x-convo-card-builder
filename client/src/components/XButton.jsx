export default function XButton({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  ...props
}) {
  const base =
    'inline-flex items-center justify-center font-medium rounded-full transition-all duration-150 cursor-pointer select-none';

  const variants = {
    primary: 'bg-x-blue text-white hover:bg-x-blue-hover active:scale-[0.98]',
    ghost:
      'bg-transparent text-x-text border border-x-border hover:bg-white/5 active:scale-[0.98]',
    danger: 'bg-x-red/10 text-x-red border border-x-red/20 hover:bg-x-red/20',
  };

  const sizes = {
    sm: 'h-8 px-4 text-sm',
    md: 'h-10 px-5 text-sm',
    lg: 'h-12 px-6 text-base',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
