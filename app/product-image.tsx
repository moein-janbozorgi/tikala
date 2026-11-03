/* eslint-disable @next/next/no-img-element -- admins paste image URLs from any host, so next/image's domain allowlist doesn't fit */
/** `className` sets size, aspect ratio and rounding. */
export function ProductImage({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  if (!src) return <div className={`flex items-center justify-center bg-surface-2 text-sm text-muted ${className}`}>بدون تصویر</div>;
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={`bg-surface-2 object-cover ${className}`} />;
}
