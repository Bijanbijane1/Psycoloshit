import React from 'react';
import { BadgeIconType } from '../types/badges';
import { Lock } from 'lucide-react';

interface BadgeIconProps {
  type: BadgeIconType;
  isUnlocked: boolean;
  size?: number;
  className?: string;
  tier?: 1 | 2 | 3;
  showStars?: boolean;
}

export const BadgeIcon: React.FC<BadgeIconProps> = ({
  type,
  isUnlocked,
  size = 72,
  className = '',
  tier = 1,
  showStars = true,
}) => {
  // Visual themes by type
  const getTheme = () => {
    switch (type) {
      case 'foundations':
        return {
          bgGrad: ['#58CC02', '#2B8200'],
          rim: '#84D800',
          accent: '#FFD900',
          shadow: '#1E6B00',
        };
      case 'neuroscience':
        return {
          bgGrad: ['#1CB0F6', '#007CB8'],
          rim: '#4CD0F9',
          accent: '#A5F3FC',
          shadow: '#005885',
        };
      case 'cognition':
        return {
          bgGrad: ['#CE82FF', '#9032DB'],
          rim: '#E3ACFF',
          accent: '#F3E8FF',
          shadow: '#6A19A8',
        };
      case 'pathology':
        return {
          bgGrad: ['#FF4B4B', '#C91E1E'],
          rim: '#FF7A7A',
          accent: '#FFE4E6',
          shadow: '#940000',
        };
      case 'clinical':
        return {
          bgGrad: ['#2B70C9', '#1A4A87'],
          rim: '#60A5FA',
          accent: '#BFDBFE',
          shadow: '#0F2F59',
        };
      case 'grandmaster':
        return {
          bgGrad: ['#FFC800', '#D68900'],
          rim: '#FFE066',
          accent: '#FFFBEB',
          shadow: '#A36200',
        };
      case 'first_quiz':
        return {
          bgGrad: ['#58CC02', '#2B8200'],
          rim: '#84D800',
          accent: '#FEF08A',
          shadow: '#1E6B00',
        };
      case 'sharpshooter':
        return {
          bgGrad: ['#FF9600', '#CC6000'],
          rim: '#FFB84D',
          accent: '#FFF7ED',
          shadow: '#993D00',
        };
      case 'match_master':
        return {
          bgGrad: ['#CE82FF', '#9032DB'],
          rim: '#E3ACFF',
          accent: '#F3E8FF',
          shadow: '#6A19A8',
        };
      case 'quiz_specialist':
        return {
          bgGrad: ['#1CB0F6', '#007CB8'],
          rim: '#4CD0F9',
          accent: '#FEF9C3',
          shadow: '#005885',
        };
      case 'speed_demon':
        return {
          bgGrad: ['#FFC800', '#E59500'],
          rim: '#FFE680',
          accent: '#FFF',
          shadow: '#A85E00',
        };
      case 'wildfire':
        return {
          bgGrad: ['#FF9600', '#D9480F'],
          rim: '#FFA94D',
          accent: '#FFF3BF',
          shadow: '#A61E4D',
        };
      case 'notes_master':
        return {
          bgGrad: ['#20C997', '#099268'],
          rim: '#63E6BE',
          accent: '#E6FCF5',
          shadow: '#087F5B',
        };
      case 'diamond_champ':
        return {
          bgGrad: ['#00B4D8', '#0077B6'],
          rim: '#90E0EF',
          accent: '#CAF0F8',
          shadow: '#03045E',
        };
      default:
        return {
          bgGrad: ['#58CC02', '#2B8200'],
          rim: '#84D800',
          accent: '#FEF08A',
          shadow: '#1E6B00',
        };
    }
  };

  const theme = getTheme();

  // Render SVG Symbol according to icon type
  const renderIconSymbol = () => {
    switch (type) {
      case 'foundations': // Ancient temple + Psi symbol
        return (
          <g transform="translate(18, 18) scale(0.64)">
            {/* Pediment triangle */}
            <path d="M50 8 L90 32 L10 32 Z" fill="#FFFFFF" />
            <rect x="15" y="32" width="70" height="6" rx="2" fill="#FFE58F" />
            {/* Columns */}
            <rect x="20" y="38" width="10" height="36" rx="2" fill="#FFFFFF" />
            <rect x="38" y="38" width="10" height="36" rx="2" fill="#FFFFFF" />
            <rect x="56" y="38" width="10" height="36" rx="2" fill="#FFFFFF" />
            <rect x="74" y="38" width="10" height="36" rx="2" fill="#FFFFFF" />
            {/* Base steps */}
            <rect x="12" y="74" width="76" height="7" rx="2" fill="#FFE58F" />
            <rect x="8" y="81" width="84" height="8" rx="3" fill="#FFFFFF" />
            {/* Psychology Psi symbol in pediment center */}
            <circle cx="50" cy="22" r="5" fill="#E5A500" />
          </g>
        );

      case 'neuroscience': // Brain with glowing synaptic nodes
        return (
          <g transform="translate(17, 16) scale(0.66)">
            {/* Brain left & right lobes */}
            <path
              d="M48 20 C42 12, 28 12, 20 22 C12 32, 14 46, 18 54 C12 60, 14 74, 24 80 C32 85, 42 80, 48 76 C54 80, 64 85, 72 80 C82 74, 84 60, 78 54 C82 46, 84 32, 76 22 C68 12, 54 12, 48 20 Z"
              fill="#FFFFFF"
            />
            {/* Center dividing fissure */}
            <path d="M48 24 Q44 48 48 74" stroke="#1CB0F6" strokeWidth="4" strokeLinecap="round" fill="none" />
            {/* Synaptic nodes */}
            <circle cx="32" cy="36" r="4.5" fill="#007CB8" />
            <circle cx="64" cy="36" r="4.5" fill="#007CB8" />
            <circle cx="28" cy="62" r="4.5" fill="#007CB8" />
            <circle cx="68" cy="62" r="4.5" fill="#007CB8" />
            {/* Synaptic sparks */}
            <path d="M32 36 L48 48 L64 36 M28 62 L48 48 L68 62" stroke="#FFC800" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="48" cy="48" r="5" fill="#FFC800" />
          </g>
        );

      case 'cognition': // Interlocking gear & puzzle light
        return (
          <g transform="translate(18, 18) scale(0.64)">
            {/* Gear 1 */}
            <circle cx="40" cy="42" r="24" fill="#FFFFFF" />
            <circle cx="40" cy="42" r="10" fill="#9032DB" />
            {/* Gear teeth */}
            <rect x="36" y="14" width="8" height="8" rx="2" fill="#FFFFFF" />
            <rect x="36" y="62" width="8" height="8" rx="2" fill="#FFFFFF" />
            <rect x="12" y="38" width="8" height="8" rx="2" fill="#FFFFFF" />
            <rect x="60" y="38" width="8" height="8" rx="2" fill="#FFFFFF" />
            {/* Lightbulb in top right */}
            <circle cx="68" cy="28" r="14" fill="#FFD900" />
            <rect x="64" y="42" width="8" height="6" rx="2" fill="#FFFFFF" />
            {/* Radiating beams */}
            <line x1="68" y1="8" x2="68" y2="2" stroke="#FFF" strokeWidth="3" strokeLinecap="round" />
            <line x1="84" y1="16" x2="89" y2="12" stroke="#FFF" strokeWidth="3" strokeLinecap="round" />
          </g>
        );

      case 'pathology': // Diagnostic magnifying glass & psychiatric shield
        return (
          <g transform="translate(18, 18) scale(0.64)">
            {/* Shield backdrop */}
            <path d="M50 10 L82 22 C82 56 50 82 50 82 C50 82 18 56 18 22 Z" fill="#FFFFFF" />
            {/* Inner emblem */}
            <path d="M50 18 L74 27 C74 52 50 72 50 72 C50 72 26 52 26 27 Z" fill="#FF4B4B" />
            {/* Magnifying glass in center */}
            <circle cx="48" cy="42" r="13" fill="#FFFFFF" stroke="#C91E1E" strokeWidth="3" />
            <line x1="57" y1="51" x2="69" y2="63" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" />
            {/* Diagnostic checkmark */}
            <path d="M42 42 L46 46 L55 37" stroke="#58CC02" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </g>
        );

      case 'clinical': // Lotus flower & healing hands
        return (
          <g transform="translate(18, 18) scale(0.64)">
            {/* Blooming Lotus petals */}
            <path d="M50 16 C38 32 32 50 50 72 C68 50 62 32 50 16 Z" fill="#FFFFFF" />
            <path d="M30 32 C20 44 24 60 44 72 C32 58 32 44 30 32 Z" fill="#BFDBFE" />
            <path d="M70 32 C80 44 76 60 56 72 C68 58 68 44 70 32 Z" fill="#BFDBFE" />
            {/* Heart in center of lotus */}
            <path
              d="M50 48 C48 44 42 44 40 48 C38 52 44 58 50 63 C56 58 62 52 60 48 C58 44 52 44 50 48 Z"
              fill="#FF4B4B"
            />
            {/* Gentle base arc */}
            <path d="M20 74 Q50 84 80 74" stroke="#FFF" strokeWidth="5" strokeLinecap="round" fill="none" />
          </g>
        );

      case 'grandmaster': // Royal crown with laurel leaves
        return (
          <g transform="translate(16, 16) scale(0.68)">
            {/* Laurel wreath left & right */}
            <path d="M20 70 Q10 40 28 20" stroke="#FFE066" strokeWidth="4" strokeLinecap="round" fill="none" />
            <path d="M80 70 Q90 40 72 20" stroke="#FFE066" strokeWidth="4" strokeLinecap="round" fill="none" />
            {/* 3D Golden Crown */}
            <path
              d="M24 66 L20 34 L36 46 L50 24 L64 46 L80 34 L76 66 Z"
              fill="#FFFFFF"
            />
            <rect x="24" y="66" width="52" height="10" rx="3" fill="#D68900" />
            {/* Crown Jewels */}
            <circle cx="20" cy="34" r="4.5" fill="#FF4B4B" />
            <circle cx="50" cy="24" r="5.5" fill="#1CB0F6" />
            <circle cx="80" cy="34" r="4.5" fill="#58CC02" />
            <circle cx="36" cy="71" r="3" fill="#FFFFFF" />
            <circle cx="50" cy="71" r="3.5" fill="#FFFFFF" />
            <circle cx="64" cy="71" r="3" fill="#FFFFFF" />
          </g>
        );

      case 'first_quiz': // Victory Trophy with stars
        return (
          <g transform="translate(18, 18) scale(0.64)">
            {/* Trophy Cup */}
            <path d="M26 22 L74 22 L68 52 Q50 64 50 64 Q32 64 26 52 Z" fill="#FFFFFF" />
            {/* Handles */}
            <path d="M26 26 Q12 36 26 48" stroke="#FFFFFF" strokeWidth="5" fill="none" strokeLinecap="round" />
            <path d="M74 26 Q88 36 74 48" stroke="#FFFFFF" strokeWidth="5" fill="none" strokeLinecap="round" />
            {/* Stem and base */}
            <rect x="44" y="64" width="12" height="12" fill="#FFE58F" />
            <rect x="32" y="76" width="36" height="8" rx="2" fill="#FFFFFF" />
            {/* Golden Star in center */}
            <polygon points="50,30 53,38 61,38 55,43 57,51 50,46 43,51 45,43 39,38 47,38" fill="#FFC800" />
          </g>
        );

      case 'sharpshooter': // Bullseye target with centered green arrow
        return (
          <g transform="translate(18, 18) scale(0.64)">
            {/* Outer Target Ring */}
            <circle cx="50" cy="50" r="36" fill="#FFFFFF" />
            <circle cx="50" cy="50" r="28" fill="#FF4B4B" />
            <circle cx="50" cy="50" r="20" fill="#FFFFFF" />
            <circle cx="50" cy="50" r="12" fill="#FF9600" />
            <circle cx="50" cy="50" r="5" fill="#FFFFFF" />
            {/* Bullseye Arrow */}
            <line x1="20" y1="20" x2="48" y2="48" stroke="#58CC02" strokeWidth="6" strokeLinecap="round" />
            <polygon points="46,38 56,48 46,58" fill="#2E7500" />
          </g>
        );

      case 'match_master': // Two interlocking puzzle pieces
        return (
          <g transform="translate(18, 18) scale(0.64)">
            {/* Puzzle piece Left */}
            <path
              d="M16 26 H38 V36 C44 36 44 46 38 46 V58 H16 Z"
              fill="#FFFFFF"
            />
            {/* Puzzle piece Right */}
            <path
              d="M42 26 H68 V58 H42 V48 C36 48 36 36 42 36 Z"
              fill="#E3ACFF"
            />
            {/* Sparkles of connection */}
            <circle cx="40" cy="41" r="5" fill="#FFD900" />
            <path d="M40 30 L40 52 M29 41 L51 41" stroke="#FFD900" strokeWidth="3" strokeLinecap="round" />
          </g>
        );

      case 'quiz_specialist': // Stethoscope & clinical question star
        return (
          <g transform="translate(18, 18) scale(0.64)">
            {/* Document sheet */}
            <rect x="22" y="14" width="46" height="60" rx="6" fill="#FFFFFF" />
            <rect x="30" y="24" width="30" height="5" rx="2" fill="#1CB0F6" />
            <rect x="30" y="34" width="22" height="5" rx="2" fill="#CBD5E1" />
            <rect x="30" y="44" width="26" height="5" rx="2" fill="#CBD5E1" />
            {/* Checkmark circle badge */}
            <circle cx="62" cy="62" r="16" fill="#58CC02" />
            <path d="M54 62 L60 68 L70 56" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </g>
        );

      case 'speed_demon': // Lightning Bolt
        return (
          <g transform="translate(18, 18) scale(0.64)">
            {/* Speed trails */}
            <line x1="16" y1="36" x2="32" y2="36" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
            <line x1="10" y1="48" x2="26" y2="48" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
            <line x1="18" y1="60" x2="30" y2="60" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
            {/* Electric lightning bolt */}
            <polygon
              points="58,10 28,48 48,48 38,86 78,42 54,42"
              fill="#FFFFFF"
              stroke="#E59500"
              strokeWidth="3"
              strokeLinejoin="round"
            />
          </g>
        );

      case 'wildfire': // Multi-tiered roaring fire
        return (
          <g transform="translate(18, 18) scale(0.64)">
            {/* Big Outer flame */}
            <path
              d="M50 12 C52 24 68 34 68 52 C68 70 52 84 50 84 C48 84 32 70 32 52 C32 38 42 26 50 12 Z"
              fill="#FFFFFF"
            />
            {/* Inner orange flame */}
            <path
              d="M50 30 C54 40 62 46 62 58 C62 68 54 76 50 76 C46 76 38 68 38 58 C38 48 44 40 50 30 Z"
              fill="#FF9600"
            />
            {/* Core yellow ember */}
            <path
              d="M50 50 C52 54 56 58 56 64 C56 70 52 74 50 74 C48 74 44 70 44 64 C44 58 48 54 50 50 Z"
              fill="#FFEA79"
            />
          </g>
        );

      case 'notes_master': // Quill and scroll
        return (
          <g transform="translate(18, 18) scale(0.64)">
            {/* Parchment scroll */}
            <rect x="20" y="24" width="48" height="54" rx="4" fill="#FFFFFF" />
            <rect x="28" y="34" width="28" height="4" rx="2" fill="#099268" />
            <rect x="28" y="44" width="32" height="4" rx="2" fill="#A7F3D0" />
            <rect x="28" y="54" width="20" height="4" rx="2" fill="#A7F3D0" />
            {/* Feather quill */}
            <path
              d="M74 12 C60 18 52 38 54 56 L48 64 L54 62 C58 52 64 36 78 22 C82 18 78 12 74 12 Z"
              fill="#FFD900"
            />
          </g>
        );

      case 'diamond_champ': // Multifaceted Diamond Gem
        return (
          <g transform="translate(18, 18) scale(0.64)">
            {/* Top crown of diamond */}
            <polygon points="30,22 70,22 84,40 16,40" fill="#FFFFFF" />
            {/* Pavilion bottom point */}
            <polygon points="16,40 84,40 50,84" fill="#E0F7FA" />
            {/* Facet lines */}
            <polygon points="42,22 58,22 66,40 34,40" fill="#B2EBF2" />
            <polygon points="34,40 66,40 50,84" fill="#0096C7" />
            {/* Sparkle star top right */}
            <polygon points="80,12 82,18 88,20 82,22 80,28 78,22 72,20 78,18" fill="#FFFFFF" />
          </g>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className={`relative inline-flex flex-col items-center select-none group transition-transform ${
        isUnlocked ? 'hover:scale-105 cursor-pointer' : 'opacity-85'
      } ${className}`}
      style={{ width: size, height: showStars ? size + 16 : size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className="overflow-visible drop-shadow-md"
      >
        <defs>
          {/* Unlocked Radiant Gradient */}
          <linearGradient id={`grad-${type}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={theme.bgGrad[0]} />
            <stop offset="100%" stopColor={theme.bgGrad[1]} />
          </linearGradient>

          {/* Locked Metallic Gradient */}
          <linearGradient id="grad-locked" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#E2E8F0" />
            <stop offset="100%" stopColor="#CBD5E1" />
          </linearGradient>

          {/* Rim Gloss Specular Highlight */}
          <linearGradient id="specular-shine" x1="0%" y1="0%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        </defs>

        {isUnlocked ? (
          <>
            {/* 3D Bottom Shadow Bevel */}
            <path
              d="M50 4 L86 16 L86 64 L50 96 L14 64 L14 16 Z"
              fill={theme.shadow}
            />

            {/* Main Shield / Medallion Body */}
            <path
              d="M50 2 L86 14 L86 58 L50 90 L14 58 L14 14 Z"
              fill={`url(#grad-${type})`}
            />

            {/* Inner Border Ring */}
            <path
              d="M50 7 L80 18 L80 54 L50 82 L20 54 L20 18 Z"
              fill="none"
              stroke={theme.rim}
              strokeWidth="3.5"
              strokeLinejoin="round"
            />

            {/* Top Gloss Specular Shine Arc */}
            <path
              d="M50 4 L84 15 L78 30 Q50 20 22 30 L16 15 Z"
              fill="url(#specular-shine)"
            />

            {/* Icon Graphic */}
            {renderIconSymbol()}
          </>
        ) : (
          <>
            {/* Locked 3D Bottom Shadow */}
            <path
              d="M50 4 L86 16 L86 64 L50 96 L14 64 L14 16 Z"
              fill="#94A3B8"
            />

            {/* Locked Matte Body */}
            <path
              d="M50 2 L86 14 L86 58 L50 90 L14 58 L14 14 Z"
              fill="url(#grad-locked)"
            />

            {/* Locked Inner Inset Border */}
            <path
              d="M50 7 L80 18 L80 54 L50 82 L20 54 L20 18 Z"
              fill="none"
              stroke="#94A3B8"
              strokeWidth="2.5"
              strokeDasharray="4 3"
              strokeLinejoin="round"
            />

            {/* Subtle Ghosted Silhouette */}
            <g opacity="0.22" filter="grayscale(100%)">
              {renderIconSymbol()}
            </g>

            {/* 3D Padlock Medallion In Center */}
            <g transform="translate(34, 30)">
              {/* Padlock shackle */}
              <path
                d="M8 12 V7 C8 3 24 3 24 7 V12"
                fill="none"
                stroke="#64748B"
                strokeWidth="4"
                strokeLinecap="round"
              />
              {/* Padlock base */}
              <rect x="4" y="12" width="24" height="20" rx="4" fill="#475569" />
              <rect x="6" y="14" width="20" height="4" rx="1" fill="#64748B" />
              {/* Keyhole */}
              <circle cx="16" cy="21" r="2.5" fill="#E2E8F0" />
              <path d="M15 21 L17 21 L18 26 L14 26 Z" fill="#E2E8F0" />
            </g>
          </>
        )}
      </svg>

      {/* Tier Stars underneath medallion */}
      {showStars && (
        <div className="flex items-center gap-1 -mt-1.5 z-10">
          {[1, 2, 3].map((starIndex) => {
            const hasStar = isUnlocked && starIndex <= tier;
            return (
              <span
                key={starIndex}
                className={`text-[11px] leading-none transition-colors ${
                  hasStar ? 'text-[#FFC800] drop-shadow-xs font-black' : 'text-slate-300'
                }`}
              >
                ★
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};
