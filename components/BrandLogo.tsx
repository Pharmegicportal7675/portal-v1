import Image from 'next/image';
import Link from 'next/link';
import { clsx } from 'clsx';

type BrandLogoVariant = 'full' | 'icon' | 'sidebar';

interface BrandLogoProps {
  variant?: BrandLogoVariant;
  href?: string;
  className?: string;
}

const SIZES: Record<BrandLogoVariant, { src: string; width: number; height: number }> = {
  full: { src: '/pharmegic-logo.png', width: 2200, height: 48 },
  icon: { src: '/favicon.png', width: 40, height: 40 },
  sidebar: { src: '/pharmegic-logo.png', width: 200, height: 44 },
};

export default function BrandLogo({ variant = 'full', href = '/', className }: BrandLogoProps) {
  const { src, width, height } = SIZES[variant];

  const image = (
    <Image
      src={src}
      alt="Pharmegic Healthcare"
      width={width}
      height={height}
      className={clsx('h-auto w-full max-w-full object-contain', className)}
      priority={variant === 'sidebar' || variant === 'full'}
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
