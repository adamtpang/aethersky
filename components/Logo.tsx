import Image from "next/image";

interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * The aethersky mark: the small airplane emoji, in Microsoft's open-source
 * Fluent Emoji artwork (MIT license). See docs/brand/FLUENT-EMOJI-LICENSE.txt.
 */
export default function Logo({ size = 28, className }: LogoProps) {
  return (
    <Image
      src="/logo.png"
      alt="aethersky"
      width={size}
      height={size}
      className={className}
      priority
      // Served as the file itself. No image optimization service is used.
      unoptimized
    />
  );
}
