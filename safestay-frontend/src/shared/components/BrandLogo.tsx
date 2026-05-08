/**
 * CheckInNow brand logo — inline SVG component.
 * Renders the two-square "step" mark at any size.
 */
export default function BrandLogo({
  size = 24,
  color = '#1B4332',
  className = '',
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      aria-label="CheckInNow logo"
    >
      <rect x="176" y="16" width="264" height="264" rx="16" fill={color} />
      <rect x="72" y="232" width="264" height="264" rx="16" fill={color} />
    </svg>
  );
}
