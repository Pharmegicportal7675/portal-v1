import Link from 'next/link';
import { clsx } from 'clsx';

type BrandLogoVariant = 'full' | 'icon' | 'sidebar';

interface BrandLogoProps {
  variant?: BrandLogoVariant;
  href?: string;
  className?: string;
}

const SIZES: Record<BrandLogoVariant, { src: string; width: number; height: number }> = {
  full: { src: '/pharmegic-logo.png', width: 200, height: 44 },
  icon: { src: '/favicon.png', width: 40, height: 40 },
  sidebar: { src: '/pharmegic-logo.png', width: 200, height: 44 },
};

export default function BrandLogo({ variant = 'full', href = '/', className }: BrandLogoProps) {
  const { src, width, height } = SIZES[variant];

  const image = (
    // Plain img — avoids /_next/image sharp pipeline on Hostinger (503 under load).
    <img
      src={src}
      alt="Pharmegic Healthcare"
      width={width}
      height={height}
      className={clsx('h-auto w-full max-w-full object-contain', className)}
      loading={variant === 'sidebar' || variant === 'full' ? 'eager' : 'lazy'}
      decoding="async"
    />
  );

  if (!href) {
    return <div className="inline-flex items-center">{image}</div>;
  }

  return (
    <Link href={href} className="w-full items-center focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent rounded-md">
      {image}
    </Link>
  );
}
