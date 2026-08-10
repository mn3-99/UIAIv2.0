import React from 'react';

interface MijlaiLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  showBackground?: boolean;
}

export const MijlaiLogo: React.FC<MijlaiLogoProps> = ({
  className = '',
  size = 'md',
  showBackground = false,
}) => {
  // Dimension presets for versatile rendering
  const sizeClasses = {
    sm: 'h-8',
    md: 'h-12',
    lg: 'h-20',
    xl: 'h-28',
    hero: 'h-36 md:h-48 max-w-full',
  };

  return (
    <div
      className={`inline-flex items-center justify-center select-none ${sizeClasses[size]} ${className}`}
    >
      <svg
        viewBox="0 0 540 180"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full object-contain"
      >
        <defs>
          {/* Radial Glow Gradient for the Sun */}
          <radialGradient
            id="mijlaiSunGlow"
            cx="50%"
            cy="50%"
            r="50%"
          >
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9" />
            <stop offset="35%" stopColor="#f97316" stopOpacity="0.5" />
            <stop offset="70%" stopColor="#fbbf24" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>

          {/* Solid Core Sun Sphere Gradient */}
          <radialGradient
            id="mijlaiSunCore"
            cx="35%"
            cy="35%"
            r="65%"
          >
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="45%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </radialGradient>

          {/* Optional soft drop shadow filter */}
          <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur" />
          </filter>
        </defs>

        {/* Optional Authentic Cream Card Background from image */}
        {showBackground && (
          <rect
            width="540"
            height="180"
            rx="16"
            fill="#f8f6ee"
          />
        )}

        {/* 1) LEFT BIRD WING / MEEM "M" SILHOUETTE */}
        <path
          d="M 82,108 C 84,72 118,52 144,52 C 165,52 178,66 186,74 C 194,66 207,52 228,52 C 254,52 288,72 290,108 C 265,88 244,74 228,74 C 210,74 196,86 186,96 C 176,86 162,74 144,74 C 128,74 107,88 82,108 Z"
          fill="#111827"
        />

        {/* 2) SWOOPING BASELINE CURVE UNDER STEMS TO "AI" */}
        <path
          d="M 230,96 C 260,126 310,138 355,124 C 380,116 402,102 418,88"
          stroke="#111827"
          strokeWidth="3.6"
          strokeLinecap="round"
          fill="none"
        />

        {/* 3) VERTICAL STEMS ("جل" / "ijl") */}
        {/* Stem 1 (Left vertical) */}
        <line
          x1="312"
          y1="82"
          x2="312"
          y2="122"
          stroke="#111827"
          strokeWidth="2.8"
          strokeLinecap="round"
        />

        {/* Stem 2 (Middle "j" with left hook) */}
        <path
          d="M 338,58 L 338,138 C 338,148 330,154 318,154"
          stroke="#111827"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Stem 3 (Right vertical) */}
        <line
          x1="368"
          y1="58"
          x2="368"
          y2="116"
          stroke="#111827"
          strokeWidth="2.8"
          strokeLinecap="round"
        />

        {/* 4) GLOWING SUN ORB */}
        {/* Soft Radial Glow Halo */}
        <circle
          cx="338"
          cy="36"
          r="26"
          fill="url(#mijlaiSunGlow)"
        />
        {/* Core Sun Circle */}
        <circle
          cx="338"
          cy="36"
          r="10.5"
          fill="url(#mijlaiSunCore)"
        />

        {/* 5) BOLD LATIN "AI" TYPOGRAPHY */}
        <text
          x="414"
          y="118"
          fill="#111827"
          fontSize="76"
          fontWeight="900"
          fontFamily="Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          letterSpacing="-2"
        >
          AI
        </text>
      </svg>
    </div>
  );
};

