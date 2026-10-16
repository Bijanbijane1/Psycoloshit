import React from 'react';

export type DuoMood = 'happy' | 'excited' | 'streak' | 'tutor' | 'thinking' | 'sad' | 'super';

interface DuoMascotProps {
  mood?: DuoMood;
  size?: number;
  className?: string;
  animate?: boolean;
}

export const DuoMascot: React.FC<DuoMascotProps> = ({
  mood = 'happy',
  size = 96,
  className = '',
  animate = true,
}) => {
  return (
    <div
      style={{ width: size, height: size }}
      className={`relative inline-flex items-center justify-center select-none ${
        animate ? 'hover:scale-105 transition-transform duration-200' : ''
      } ${className}`}
      title="Duo - راهنمای مهربان روان‌شناسی"
    >
      <svg
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-md"
      >
        {/* Shadow under owl */}
        <ellipse cx="60" cy="112" rx="38" ry="7" fill="#000000" fillOpacity="0.12" />

        {/* Orange Feet */}
        <path
          d="M44 106 C44 112, 36 114, 34 114 C32 114, 30 110, 36 106 Z"
          fill="#FF9600"
        />
        <path
          d="M76 106 C76 112, 84 114, 86 114 C88 114, 90 110, 84 106 Z"
          fill="#FF9600"
        />
        <ellipse cx="42" cy="108" rx="7" ry="3.5" fill="#E58500" />
        <ellipse cx="78" cy="108" rx="7" ry="3.5" fill="#E58500" />

        {/* Super Duo Cape (if mood === 'super') */}
        {mood === 'super' && (
          <path
            d="M32 60 C20 80, 15 105, 22 108 C30 110, 38 85, 42 70 Z"
            fill="#CE82FF"
            stroke="#A557DF"
            strokeWidth="2"
          />
        )}
        {mood === 'super' && (
          <path
            d="M88 60 C100 80, 105 105, 98 108 C90 110, 82 85, 78 70 Z"
            fill="#CE82FF"
            stroke="#A557DF"
            strokeWidth="2"
          />
        )}

        {/* Main Body - Duolingo Classic Green Shape */}
        <rect
          x="24"
          y="28"
          width="72"
          height="78"
          rx="36"
          fill="#58CC02"
        />
        {/* Subtle 3D bottom bevel */}
        <path
          d="M26 84 C30 102, 90 102, 94 84 C90 106, 30 106, 26 84 Z"
          fill="#46A302"
        />

        {/* Light Green Tummy Patch */}
        <ellipse cx="60" cy="74" rx="22" ry="24" fill="#79D800" />
        {/* Tummy feather chevrons */}
        <path
          d="M54 68 Q60 72 66 68"
          stroke="#58CC02"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M52 77 Q60 82 68 77"
          stroke="#58CC02"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M55 86 Q60 89 65 86"
          stroke="#58CC02"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Left Wing */}
        {mood === 'excited' ? (
          <path
            d="M25 60 C10 40, 6 25, 14 26 C22 27, 28 45, 27 60 Z"
            fill="#58CC02"
            stroke="#46A302"
            strokeWidth="2"
          />
        ) : mood === 'streak' ? (
          <path
            d="M24 62 C14 55, 12 40, 20 40 C26 40, 26 56, 25 68 Z"
            fill="#58CC02"
          />
        ) : (
          <path
            d="M25 60 C16 68, 14 84, 22 88 C28 90, 28 75, 27 62 Z"
            fill="#46A302"
          />
        )}

        {/* Right Wing */}
        {mood === 'excited' ? (
          <path
            d="M95 60 C110 40, 114 25, 106 26 C98 27, 92 45, 93 60 Z"
            fill="#58CC02"
            stroke="#46A302"
            strokeWidth="2"
          />
        ) : mood === 'happy' ? (
          // Waving right wing
          <path
            d="M95 55 C108 45, 112 36, 108 34 C102 32, 94 48, 93 62 Z"
            fill="#58CC02"
            stroke="#46A302"
            strokeWidth="1.5"
          />
        ) : (
          <path
            d="M95 60 C104 68, 106 84, 98 88 C92 90, 92 75, 93 62 Z"
            fill="#46A302"
          />
        )}

        {/* Big Round Duo Eyes */}
        {/* Left Eye Socket */}
        <circle cx="44" cy="46" r="15" fill="#FFFFFF" />
        <circle cx="44" cy="46" r="15" stroke="#46A302" strokeWidth="1.5" />
        {/* Right Eye Socket */}
        <circle cx="76" cy="46" r="15" fill="#FFFFFF" />
        <circle cx="76" cy="46" r="15" stroke="#46A302" strokeWidth="1.5" />

        {/* Pupils & Expressions */}
        {mood === 'sad' ? (
          <>
            <circle cx="45" cy="49" r="7" fill="#4B4B4B" />
            <circle cx="75" cy="49" r="7" fill="#4B4B4B" />
            <circle cx="43" cy="47" r="2.5" fill="#FFFFFF" />
            <circle cx="73" cy="47" r="2.5" fill="#FFFFFF" />
            {/* Tear */}
            <path
              d="M32 58 C32 63, 29 65, 29 68 C29 70, 31 71, 33 71 C35 71, 36 69, 35 66 C34 63, 32 58, 32 58 Z"
              fill="#1CB0F6"
            />
          </>
        ) : mood === 'thinking' ? (
          <>
            <circle cx="48" cy="43" r="6.5" fill="#4B4B4B" />
            <circle cx="80" cy="43" r="6.5" fill="#4B4B4B" />
            <circle cx="49" cy="41" r="2.5" fill="#FFFFFF" />
            <circle cx="81" cy="41" r="2.5" fill="#FFFFFF" />
          </>
        ) : mood === 'excited' ? (
          <>
            {/* Happy arch eyes */}
            <path
              d="M36 48 Q44 38 52 48"
              stroke="#2E2E2E"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M68 48 Q76 38 84 48"
              stroke="#2E2E2E"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            {/* Standard bright friendly eyes */}
            <circle cx="46" cy="46" r="7" fill="#4B4B4B" />
            <circle cx="74" cy="46" r="7" fill="#4B4B4B" />
            <circle cx="48" cy="44" r="2.5" fill="#FFFFFF" />
            <circle cx="76" cy="44" r="2.5" fill="#FFFFFF" />
          </>
        )}

        {/* Orange Beak */}
        <polygon points="54,48 66,48 60,60" fill="#FF9600" />
        <polygon points="56,48 64,48 60,57" fill="#FFAE33" />
        <path d="M54 48 L66 48 L60 60 Z" stroke="#E58500" strokeWidth="1" />

        {/* Teacher Glasses (mood === 'tutor') */}
        {mood === 'tutor' && (
          <g>
            <circle cx="44" cy="46" r="16" stroke="#2B2B2B" strokeWidth="2.5" fill="none" />
            <circle cx="76" cy="46" r="16" stroke="#2B2B2B" strokeWidth="2.5" fill="none" />
            <path d="M59 45 L61 45" stroke="#2B2B2B" strokeWidth="3" />
            <path d="M28 44 L24 43" stroke="#2B2B2B" strokeWidth="2.5" />
            <path d="M92 44 L96 43" stroke="#2B2B2B" strokeWidth="2.5" />
            {/* Graduation Cap */}
            <polygon points="60,8 90,20 60,28 30,20" fill="#1C1C1E" />
            <polygon points="60,10 86,20 60,26 34,20" fill="#2C2C2E" />
            <rect x="48" y="24" width="24" height="6" fill="#1C1C1E" rx="2" />
            {/* Tassel */}
            <path d="M85 22 Q92 26 90 38" stroke="#FFC800" strokeWidth="2" fill="none" />
            <circle cx="90" cy="38" r="2.5" fill="#FFC800" />
          </g>
        )}

        {/* Super Crown (mood === 'super') */}
        {mood === 'super' && (
          <g>
            <polygon points="42,26 48,12 60,20 72,12 78,26" fill="#FFC800" stroke="#E5A500" strokeWidth="1.5" />
            <circle cx="48" cy="12" r="2" fill="#FF4B4B" />
            <circle cx="60" cy="20" r="2" fill="#1CB0F6" />
            <circle cx="72" cy="12" r="2" fill="#FF4B4B" />
          </g>
        )}

        {/* Streak Flame (mood === 'streak') */}
        {mood === 'streak' && (
          <g transform="translate(10, 36) scale(0.65)">
            <path
              d="M20 0 C22 10 32 15 32 25 C32 35 24 40 18 40 C10 40 4 34 4 24 C4 16 12 10 14 4 C14 4 16 12 19 12 C22 12 20 0 20 0 Z"
              fill="#FF9600"
            />
            <path
              d="M18 14 C19 19 24 22 24 28 C24 33 20 36 17 36 C13 36 9 32 9 26 C9 22 14 18 15 15 C15 15 16 20 18 20 C19 20 18 14 18 14 Z"
              fill="#FFC800"
            />
          </g>
        )}
      </svg>
    </div>
  );
};
