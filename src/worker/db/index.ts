/**
 * D1 Data Access Layer Module Index
 * Project: PsychoMaster (روان‌لینگو)
 */

export * from './schema.ts';
export * from './userRepository.ts';
export * from './questionRepository.ts';
export * from './examRepository.ts';

import type { D1Database } from '../types.ts';
import { D1UserRepository } from './userRepository.ts';
import { D1QuestionRepository } from './questionRepository.ts';
import { D1ExamRepository } from './examRepository.ts';

/**
 * Convenience helper to instantiate all D1 repositories for a given D1 binding
 */
export function createD1Client(db: D1Database) {
  return {
    users: new D1UserRepository(db),
    questions: new D1QuestionRepository(db),
    exams: new D1ExamRepository(db),
  };
}

