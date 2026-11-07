/* eslint-disable @next/next/no-img-element -- admins paste image URLs from any host, so next/image's domain allowlist doesn't fit */
import { getImageProps } from "next/image";

/**
 * `className` sets size, aspect ratio and rounding. `sizes` is the shown width (like "96px" or "50vw"), so phones
 * download a small WebP instead of the full photo. `eager` is for photos visible on load (the page's largest image).
 */
export function ProductImage({ src, alt, sizes, eager = false, className = "" }: { src: string; alt: string; sizes: string; eager?: boolean; className?: string }) {
  if (!src) return <div className={`flex items-center justify-center bg-surface-2 text-sm text-muted ${className}`}>بدون تصویر</div>;
  const load = { loading: eager ? "eager" : "lazy", fetchPriority: eager ? "high" : undefined } as const;
  // Our own photos (public/products, /uploads) go through Next's resizer; pasted URLs from other hosts are shown as they are.
  const local = src.startsWith("/") && !src.startsWith("//");
  // width/height only shape the srcset (photos are stored at most 1200×1500); the className sets the displayed size.
  const props = local ? getImageProps({ src, alt, sizes, width: 1200, height: 1500, ...load }).props : { src, ...load };
  return <img {...props} alt={alt} decoding="async" style={undefined} className={`bg-surface-2 object-cover ${className}`} />;
}
