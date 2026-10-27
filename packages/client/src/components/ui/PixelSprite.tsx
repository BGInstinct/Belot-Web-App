import type { ImgHTMLAttributes } from 'react';

export interface PixelSpriteProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'width' | 'height'> {
  src: string;
  /** native sprite width/height in px */
  width: number;
  height: number;
  /** integer scale factor */
  scale?: number;
}

/** <img> rendered at an integer multiple of its native size with nearest-neighbour scaling. */
export function PixelSprite({ src, width, height, scale = 2, alt = '', className = '', style, ...rest }: PixelSpriteProps) {
  const s = Math.max(1, Math.round(scale));
  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      width={width * s}
      height={height * s}
      className={`pixelated inline-block select-none ${className}`}
      style={{ width: width * s, height: height * s, ...style }}
      {...rest}
    />
  );
}
