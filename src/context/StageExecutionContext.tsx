import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { DuolingoStage, StageCompletionRecord, UserProgress } from '../types/psychology';
import {
  stageExecutionEngine,
  CurriculumAuditReport,
  CurriculumTier,
  CURRICULUM_TIERS,
} from '../services/stageExecutionEngine';

interface StageExecutionContextType {
  stages: DuolingoStage[];
  currentUnlockedStageNumber: number;
  activeStage: DuolingoStage | null;
  setActiveStage: (stage: DuolingoStage | null) => void;
  isStageModalOpen: boolean;
  setIsStageModalOpen: (open: boolean) => void;
  selectedUnitFilter: number | 'all';
  setSelectedUnitFilter: (unit: number | 'all') => void;
  displayedStages: DuolingoStage[];
  auditReport: CurriculumAuditReport;
  curriculumTiers: CurriculumTier[];
  isStageAccessible: (stageNumber: number) => { isMet: boolean; missingStageNumber?: number; reason?: string };
  getStageByNumber: (stageNumber: number) => DuolingoStage | undefined;
  completedStagesCount: number;
  totalXpEarned: number;
  acquiredCompetencies: string[];
  isPrerequisiteInspectorOpen: boolean;
  setIsPrerequisiteInspectorOpen: (open: boolean) => void;
  handleStartStage: (stageNumber: number) => void;
}

const StageExecutionContext = createContext<StageExecutionContextType | undefined>(undefined);

interface StageExecutionProviderProps {
  children: React.ReactNode;
  progress: UserProgress;
  onCompleteStage?: (record: StageCompletionRecord) => void;
}

export const StageExecutionProvider: React.FC<StageExecutionProviderProps> = ({
  children,
  progress,
}) => {
  // Pre-sorted and gated stages from engine
  const stages = useMemo(() => stageExecutionEngine.getSortedStages(), []);

  // Run curriculum audit once
  const auditReport = useMemo(() => stageExecutionEngine.runCurriculumAudit(), []);

  // Active filter for units
  const [selectedUnitFilter, setSelectedUnitFilter] = useState<number | 'all'>('all');

  // Active selected stage for player modal
  const [activeStage, setActiveStage] = useState<DuolingoStage | null>(null);
  const [isStageModalOpen, setIsStageModalOpen] = useState<boolean>(false);
  const [isPrerequisiteInspectorOpen, setIsPrerequisiteInspectorOpen] = useState<boolean>(false);

  // Highest unlocked stage number based on completion records
  const currentUnlockedStageNumber = useMemo(() => {
    return stageExecutionEngine.calculateUnlockedStageNumber(progress.completedStages);
  }, [progress.completedStages]);

  // Filtered stages for display
  const displayedStages = useMemo(() => {
    if (selectedUnitFilter === 'all') return stages;
    return stages.filter((s) => s.unitIndex === selectedUnitFilter);
  }, [stages, selectedUnitFilter]);

  // Check if a stage meets its prerequisites
  const isStageAccessible = useCallback(
    (stageNumber: number) => {
      return stageExecutionEngine.isStagePrerequisiteMet(stageNumber, progress.completedStages);
    },
    [progress.completedStages]
  );

  const getStageByNumber = useCallback(
    (stageNumber: number) => {
      return stageExecutionEngine.getStage(stageNumber);
    },
    []
  );

  // Completed stages count and XP
  const completedStagesCount = useMemo(() => {
    return Object.keys(progress.completedStages || {}).length;
  }, [progress.completedStages]);

  const totalXpEarned = useMemo(() => {
    const records = Object.values(progress.completedStages || {});
    return records.reduce((sum, r) => sum + (r.xpEarned || 0), 0);
  }, [progress.completedStages]);

  // List of competencies acquired so far
  const acquiredCompetencies = useMemo(() => {
    const completedSet = new Set(
      Object.keys(progress.completedStages || {}).map(Number)
    );
    const competencies: string[] = [];

    CURRICULUM_TIERS.forEach((tier) => {
      // If at least 50% of the tier's stages are completed, award competencies
      const tierStages = stages.filter(
        (s) => s.stageNumber >= tier.stageRange[0] && s.stageNumber <= tier.stageRange[1]
      );
      const tierCompleted = tierStages.filter((s) => completedSet.has(s.stageNumber)).length;
      if (tierCompleted >= Math.ceil(tierStages.length / 2)) {
        competencies.push(...tier.coreCompetencies);
      }
    });

    return competencies;
  }, [progress.completedStages, stages]);

  // Start a stage cleanly
  const handleStartStage = useCallback(
    (stageNumber: number) => {
      const st = stageExecutionEngine.getStage(stageNumber);
      if (st) {
        setActiveStage(st);
        setIsStageModalOpen(true);
      }
    },
    []
  );

  const value: StageExecutionContextType = {
    stages,
    currentUnlockedStageNumber,
    activeStage,
    setActiveStage,
    isStageModalOpen,
    setIsStageModalOpen,
    selectedUnitFilter,
    setSelectedUnitFilter,
    displayedStages,
    auditReport,
    curriculumTiers: CURRICULUM_TIERS,
    isStageAccessible,
    getStageByNumber,
    completedStagesCount,
    totalXpEarned,
    acquiredCompetencies,
    isPrerequisiteInspectorOpen,
    setIsPrerequisiteInspectorOpen,
    handleStartStage,
  };

  return (
    <StageExecutionContext.Provider value={value}>
      {children}
    </StageExecutionContext.Provider>
  );
};

export const useStageExecution = (): StageExecutionContextType => {
  const context = useContext(StageExecutionContext);
  if (!context) {
    throw new Error('useStageExecution must be used within a StageExecutionProvider');
  }
  return context;
};
