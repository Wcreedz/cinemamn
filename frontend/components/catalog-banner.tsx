'use client';
import Link from 'next/link';
import type { CatalogBanner as Banner } from '@mongolflix/shared';

// Өргөн дэлгэц дэх нарийн зураг утсанд уншигдахааргүй жижигрэх тул утсанд тусдаа зураг харуулна.
export function CatalogBanner({ banner }: { banner: Banner }) {
  const image = (
    <picture>
      {banner.mobileImage && <source media="(max-width: 639px)" srcSet={banner.mobileImage} />}
      <img src={banner.image} alt="Баннер" className="block h-auto w-full lg:h-16 lg:object-cover" />
    </picture>
  );
  const { link } = banner;
  return (
    <div className="order-first min-w-0 basis-full overflow-hidden rounded-lg lg:order-none lg:flex-1 lg:basis-0">
      {!link ? image
        : link.startsWith('/') ? <Link href={link} className="block">{image}</Link>
        : <a href={link} target="_blank" rel="noopener noreferrer" className="block">{image}</a>}
    </div>
  );
}
