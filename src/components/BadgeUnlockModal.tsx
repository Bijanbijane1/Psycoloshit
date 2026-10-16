import React, { useEffect } from 'react';
import { BadgeDefinition } from '../types/badges';
import { BadgeIcon } from './BadgeIcon';
import { DuoMascot } from './DuoMascot';
import { playDuoSound } from '../utils/duoAudio';
import confetti from 'canvas-confetti';
import { Sparkles, Trophy, X, ArrowLeft } from 'lucide-react';

interface BadgeUnlockModalProps {
  badge: BadgeDefinition | null;
  onClose: () => void;
  onViewAllBadges: () => void;
}

export const BadgeUnlockModal: React.FC<BadgeUnlockModalProps> = ({
  badge,
  onClose,
  onViewAllBadges,
}) => {
  useEffect(() => {
    if (badge) {
      // Trigger festive sound & confetti
      playDuoSound('complete');

      const count = 200;
      const defaults = {
        origin: { y: 0.65 },
        zIndex: 1000,
      };

      function fire(particleRatio: number, opts: confetti.Options) {
        confetti({
          ...defaults,
          ...opts,
          particleCount: Math.floor(count * particleRatio),
        });
      }

      fire(0.25, {
        spread: 26,
        startVelocity: 55,
        colors: ['#58CC02', '#FFC800', '#1CB0F6'],
      });
      fire(0.2, {
        spread: 60,
        colors: ['#FF9600', '#CE82FF', '#FF4B4B'],
      });
      fire(0.35, {
        spread: 100,
        decay: 0.91,
        scalar: 0.8,
      });
      fire(0.1, {
        spread: 120,
        startVelocity: 25,
        decay: 0.92,
        scalar: 1.2,
      });
      fire(0.1, {
        spread: 120,
        startVelocity: 45,
      });
    }
  }, [badge]);

  if (!badge) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs select-none animate-fadeIn">
      <div className="relative w-full max-w-md bg-white rounded-3xl border-2 border-b-6 border-[#58CC02] p-6 sm:p-8 text-center shadow-2xl flex flex-col items-center">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top Celebration Ribbon */}
        <div className="flex items-center gap-1.5 px-3 py-1 bg-[#FFC800]/20 border border-[#FFC800] rounded-full text-[#A16207] text-xs font-black mb-4">
          <Trophy className="w-4 h-4 text-[#E5A500] fill-[#FFC800]" />
          <span>دستاورد جدید بازگشایی شد!</span>
        </div>

        {/* Cheering Duo Mascot */}
        <div className="mb-2">
          <DuoMascot mood="excited" size={88} animate={true} />
        </div>

        {/* Glowing Badge Medallion */}
        <div className="relative my-3 p-4">
          <div className="absolute inset-0 bg-radial from-[#FFC800]/30 to-transparent blur-xl animate-pulse" />
          <BadgeIcon
            type={badge.iconType}
            isUnlocked={true}
            size={110}
            tier={3}
            showStars={true}
          />
        </div>

        {/* Title & Badge Details */}
        <h2 className="text-2xl font-black text-slate-800 mt-2">
          {badge.title}
        </h2>
        <span className="text-xs font-bold text-slate-400 -mt-1 block">
          {badge.englishTitle}
        </span>

        <p className="text-sm font-bold text-slate-600 mt-3 px-2 leading-relaxed">
          {badge.description}
        </p>

        {/* XP Reward Pill */}
        <div className="flex items-center gap-2 bg-[#F7FEE7] border-2 border-[#58CC02] text-[#2E7500] px-4 py-2 rounded-2xl font-black text-sm my-4 shadow-2xs">
          <Sparkles className="w-5 h-5 text-[#58CC02] animate-bounce" />
          <span>+{badge.xpReward} XP پاداش دستاورد به کارنامه افزوده شد!</span>
        </div>

        {/* Actions */}
        <div className="w-full flex flex-col sm:flex-row gap-2.5 mt-2">
          <button
            onClick={() => {
              onClose();
              onViewAllBadges();
            }}
            className="flex-1 duo-btn-blue py-3 rounded-2xl text-xs font-black cursor-pointer flex items-center justify-center gap-2"
          >
            <Trophy className="w-4 h-4" />
            <span>مشاهده تالار مدال‌ها</span>
          </button>
          <button
            onClick={onClose}
            className="flex-1 duo-btn-green py-3 rounded-2xl text-xs font-black cursor-pointer flex items-center justify-center gap-2"
          >
            <span>ادامه مسیر</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
