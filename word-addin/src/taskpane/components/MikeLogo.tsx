import React from "react";

/**
 * Mike logo — the daisy/burst mark. Pure inline SVG so it doesn't need to
 * be served as a static asset and renders crisply at any size. 12 petals
 * radiating from the centre, monochrome.
 */
export default function MikeLogo({
  size = 48,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const petals: React.ReactNode[] = [];
  // 12 petals, 30° apart, each is a vertical ellipse rotated around the
  // centre. The ellipse sits *outside* the centre point so the petals form
  // a ring with a clear core.
  for (let i = 0; i < 12; i++) {
    const angle = (i * 360) / 12;
    petals.push(
      <ellipse
        key={i}
        cx="32"
        cy="11"
        rx="2.6"
        ry="9"
        transform={`rotate(${angle} 32 32)`}
        fill="currentColor"
      />,
    );
  }
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      {petals}
    </svg>
  );
}
