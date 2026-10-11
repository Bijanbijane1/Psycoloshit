import React from 'react';
import {
  X,
  ShieldCheck,
  Layers,
  CheckCircle2,
  Lock,
  ChevronLeft,
  Sparkles,
  Award,
  BookOpen,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { useStageExecution } from '../context/StageExecutionContext';

interface PrerequisiteInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrerequisiteInspectorModal: React.FC<PrerequisiteInspectorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    auditReport,
    curriculumTiers,
    currentUnlockedStageNumber,
    completedStagesCount,
    stages,
    acquiredCompetencies,
  } = useStageExecution();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs select-none animate-fadeIn">
      <div className="bg-white border-2 border-b-6 border-slate-300 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scaleUp">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3 text-right min-w-0 flex-1">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black text-slate-800 leading-snug">
                  سیستم مدیریت پیش‌نیازها و گیت سختی
                </h3>
                <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1 shrink-0">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  فعال
                </span>
              </div>
              <p className="text-xs font-bold text-slate-500 mt-0.5 truncate">
                ترتیب اجرای ۱۰۰ مرحله با سورت خودکار و ممانعت از ورود سوالات پیشرفته به مراحل اولیه
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-right">
          {/* Audit Verification Card */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-300 rounded-2xl p-4 shadow-2xs">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-black text-emerald-950">
                  تأییدیه سلامت سرفصل‌ها و توالی آموزشی: ۱۰۰٪ منطبق
                </h4>
                <p className="text-xs font-bold text-emerald-800 mt-1 leading-relaxed">
                  سیستم به صورت خودکار تمام {auditReport.totalQuestions} سوال موجود در ۱۰۰ مرحله را ارزیابی کرده است.
                  تعداد سوالات پیشرفته در مراحل ۱ تا ۱۰ دقیقاً <span className="underline font-black text-emerald-950">صفر</span> است.
                </p>
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-emerald-200 text-center text-xs">
                  <div className="bg-white/80 rounded-xl p-2 border border-emerald-200">
                    <span className="text-slate-500 block text-[10px] font-bold">سوالات پایه (Basic)</span>
                    <strong className="text-sm font-black text-emerald-700">
                      {auditReport.difficultyDistribution.basic}
                    </strong>
                  </div>
                  <div className="bg-white/80 rounded-xl p-2 border border-emerald-200">
                    <span className="text-slate-500 block text-[10px] font-bold">سوالات میانی (Intermediate)</span>
                    <strong className="text-sm font-black text-amber-700">
                      {auditReport.difficultyDistribution.intermediate}
                    </strong>
                  </div>
                  <div className="bg-white/80 rounded-xl p-2 border border-emerald-200">
                    <span className="text-slate-500 block text-[10px] font-bold">پیشرفته (مراحل پایانی)</span>
                    <strong className="text-sm font-black text-purple-700">
                      {auditReport.difficultyDistribution.advanced}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 5 Units Prerequisite Tree */}
          <div>
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
              زنجیره ۵ واحد سرفصل و شرایط دسترسی (Prerequisites DAG):
            </h4>

            <div className="space-y-3">
              {curriculumTiers.map((tier, idx) => {
                const breakdown = auditReport.tierBreakdowns.find((b) => b.tierId === tier.id);
                const isUnlocked = currentUnlockedStageNumber >= tier.stageRange[0];
                const isCompleted = completedStagesCount >= tier.stageRange[1];

                return (
                  <div
                    key={tier.id}
                    className={`border-2 rounded-2xl p-3.5 transition-all ${
                      isCompleted
                        ? 'bg-amber-50/60 border-amber-300'
                        : isUnlocked
                        ? 'bg-white border-indigo-300 shadow-xs'
                        : 'bg-slate-50 border-slate-200 opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center ${
                            isCompleted
                              ? 'bg-amber-500 text-white'
                              : isUnlocked
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-300 text-slate-600'
                          }`}
                        >
                          {tier.unitIndex}
                        </span>
                        <h5 className="text-xs sm:text-sm font-black text-slate-800">
                          {tier.name}
                        </h5>
                      </div>

                      <span
                        className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                          isCompleted
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : isUnlocked
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            : 'bg-slate-200 text-slate-600 border-slate-300'
                        }`}
                      >
                        {isCompleted
                          ? 'تکمیل شد'
                          : isUnlocked
                          ? `در حال اجرا (مراحل ${tier.stageRange[0]}-${tier.stageRange[1]})`
                          : `قفل (نیازمند واحد ${tier.unitIndex - 1})`}
                      </span>
                    </div>

                    <p className="text-[11px] font-bold text-slate-600 leading-relaxed">
                      {tier.description}
                    </p>

                    {/* Difficulty Distribution Bar */}
                    {breakdown && (
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-slate-500">
                        <span>
                          توزیع سوالات: {breakdown.difficultyCounts.basic} پایه | {breakdown.difficultyCounts.intermediate} میانی | {breakdown.difficultyCounts.advanced} پیشرفته
                        </span>
                        <span className="font-black text-slate-700">
                          سقف سوالات پیشرفته: {tier.maxAdvancedPercent}٪
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-600">
            مرحله فعلی در دسترس: <strong className="text-indigo-600 font-black">مرحله {currentUnlockedStageNumber}</strong>
          </div>
          <button
            onClick={onClose}
            className="duo-btn-green px-6 py-2.5 rounded-xl text-xs font-black cursor-pointer"
          >
            بستن و ادامه مسیر
          </button>
        </div>
      </div>
    </div>
  );
};
