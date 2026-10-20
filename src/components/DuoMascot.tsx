import React from 'react';

export type DuoMood = 'happy' | 'excited' | 'streak' | 'tutor' | 'thinking' | 'sad' | 'super';

interface DuoMascotProps {
  mood?: DuoMood;
  size?: number;
  className?: string;
  animate?: boolean;
}

/**
 * Original PsychoMaster Learning Companion ("سایکو" - PsychoMind)
 * A friendly, tactile cognitive-gem & neural-wave character designed
 * specifically for psychology education (no owl/bird features).
 */
export const DuoMascot: React.FC<DuoMascotProps> = ({
  mood = 'happy',
  size = 96,
  className = '',
  animate = true,
}) => {
  const primaryFill =
    mood === 'super'
      ? '#4F46E5'
      : mood === 'streak'
      ? '#FF9600'
      : '#16A34A';

  const bottomLipFill =
    mood === 'super'
      ? '#3730A3'
      : mood === 'streak'
      ? '#E58500'
      : '#15803D';

  const highlightFill =
    mood === 'super'
      ? '#818CF8'
      : mood === 'streak'
      ? '#FFC800'
      : '#4ADE80';

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative inline-flex items-center justify-center select-none ${
        animate ? 'hover:scale-105 transition-transform duration-150' : ''
      } ${className}`}
      title="سایکو - همراه هوشمند یادگیری روان‌شناسی"
    >
      <svg
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Ground contact shadow */}
        <ellipse cx="60" cy="111" rx="34" ry="6" fill="#0F172A" fillOpacity="0.1" />

        {/* Subtle neural aura nodes for super / thinking moods */}
        {(mood === 'super' || mood === 'thinking') && (
          <g>
            <circle cx="18" cy="36" r="5" fill="#CE82FF" />
            <circle cx="102" cy="36" r="5" fill="#1CB0F6" />
            <path d="M22 39 L32 46" stroke="#CE82FF" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M98 39 L88 46" stroke="#1CB0F6" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}

        {/* Dual-hemisphere sculpted cognitive body (3D lower bevel) */}
        <rect
          x="20"
          y="26"
          width="80"
          height="78"
          rx="32"
          fill={bottomLipFill}
        />
        <rect
          x="20"
          y="20"
          width="80"
          height="76"
          rx="32"
          fill={primaryFill}
        />

        {/* Top cortical indent / silhouette contour */}
        <path
          d="M52 20 Q60 27 68 20"
          stroke={bottomLipFill}
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Glossy top-right highlight */}
        <path
          d="M34 30 C44 25, 66 25, 78 29"
          stroke={highlightFill}
          strokeWidth="4.5"
          strokeLinecap="round"
        />

        {/* Subtle neural wave emblem on lower chest */}
        <path
          d="M42 82 Q51 76 60 82 T78 82"
          stroke={highlightFill}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />

        {/* Face Visor Plate */}
        <rect
          x="30"
          y="36"
          width="60"
          height="36"
          rx="18"
          fill="#FFFFFF"
          stroke={bottomLipFill}
          strokeWidth="2"
        />

        {/* Eyes & Facial Expressions */}
        {mood === 'sad' ? (
          <g>
            <circle cx="46" cy="54" r="5.5" fill="#1E293B" />
            <circle cx="74" cy="54" r="5.5" fill="#1E293B" />
            <path d="M40 46 L50 49" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M80 46 L70 49" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />
            <path
              d="M52 64 Q60 59 68 64"
              stroke="#1E293B"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        ) : mood === 'thinking' ? (
          <g>
            <circle cx="48" cy="51" r="5.5" fill="#1E293B" />
            <circle cx="76" cy="51" r="5.5" fill="#1E293B" />
            <circle cx="49.5" cy="49.5" r="2" fill="#FFFFFF" />
            <circle cx="77.5" cy="49.5" r="2" fill="#FFFFFF" />
            <path d="M41 44 Q46 41 52 44" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <path d="M69 45 L79 43" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M54 62 L66 61" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        ) : mood === 'excited' ? (
          <g>
            <path
              d="M39 53 Q46 44 53 53"
              stroke="#1E293B"
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M67 53 Q74 44 81 53"
              stroke="#1E293B"
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M50 59 Q60 68 70 59 Z"
              fill="#FF4B4B"
              stroke="#1E293B"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </g>
        ) : (
          <g>
            <circle cx="46" cy="52" r="6" fill="#1E293B" />
            <circle cx="74" cy="52" r="6" fill="#1E293B" />
            <circle cx="48" cy="50" r="2.2" fill="#FFFFFF" />
            <circle cx="76" cy="50" r="2.2" fill="#FFFFFF" />
            <path
              d="M52 60 Q60 66 68 60"
              stroke="#1E293B"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        )}

        {/* Academic Glasses & Mortarboard for 'tutor' mood */}
        {mood === 'tutor' && (
          <g>
            <rect x="35" y="43" width="22" height="16" rx="6" stroke="#0F172A" strokeWidth="2.5" fill="none" />
            <rect x="63" y="43" width="22" height="16" rx="6" stroke="#0F172A" strokeWidth="2.5" fill="none" />
            <path d="M57 51 L63 51" stroke="#0F172A" strokeWidth="2.5" />
            <polygon points="60,6 90,17 60,26 30,17" fill="#1E293B" />
            <rect x="46" y="22" width="28" height="5" rx="2" fill="#334155" />
            <path d="M84 19 Q90 25 88 34" stroke="#FFC800" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <circle cx="88" cy="34" r="3" fill="#FFC800" />
          </g>
        )}

        {/* Golden Mastery Crown for 'super' mood */}
        {mood === 'super' && (
          <g>
            <polygon
              points="42,21 48,8 60,16 72,8 78,21"
              fill="#FFC800"
              stroke="#E5A500"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <circle cx="60" cy="15" r="2.5" fill="#FFFFFF" />
          </g>
        )}

        {/* Streak Badge for 'streak' mood */}
        {mood === 'streak' && (
          <g transform="translate(80, 10) scale(0.75)">
            <circle cx="20" cy="20" r="16" fill="#FFFFFF" stroke="#E58500" strokeWidth="2.5" />
            <path
              d="M20 7 C22 14 29 17 29 24 C29 30 24 33 19 33 C14 33 10 29 10 23 C10 18 15 14 17 10 C17 10 18 15 20 15 C22 15 20 7 20 7 Z"
              fill="#FF9600"
            />
          </g>
        )}
      </svg>
    </div>
  );
};
