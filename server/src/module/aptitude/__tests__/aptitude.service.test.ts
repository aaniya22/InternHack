import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AptitudeService } from '../aptitude.service.js';
import { prisma } from '../../../database/db.js';
import * as difficultyHelpers from '../aptitude.difficulty.js';

// Mock the database and external dependencies
vi.mock('../../../database/db.js', () => ({
  prisma: {
    aptitudeQuestion: { count: vi.fn(), findUnique: vi.fn() },
    studentAptitudeProgress: { findMany: vi.fn(), count: vi.fn(), upsert: vi.fn() },
    studentAptitudeTopicProgress: { findUnique: vi.fn(), upsert: vi.fn() },
  }
}));

// Mock the milestone service so tests don't try to trigger side effects.
// We use an actual ES6 class here because AptitudeService calls `new MilestoneService()`,
// and arrow functions cannot be used as constructors.
vi.mock('../../milestone/milestone.service.js', () => ({
  MilestoneService: class {
    checkAptitudeMilestone = vi.fn().mockResolvedValue(undefined);
  }
}));

// Mock the pure function that calculates difficulty shifts
vi.mock('../aptitude.difficulty.js', () => ({
  applyAptitudeDifficultyChange: vi.fn(),
}));

describe('AptitudeService - Scoring & Progress', () => {
  let service: AptitudeService;

  beforeEach(() => {
    service = new AptitudeService();
    vi.clearAllMocks();
  });

  describe('getProgress (Score computation and Streak logic)', () => {
    const NOW_MS = Date.now();
    const TODAY = new Date(NOW_MS);
    TODAY.setUTCHours(0, 0, 0, 0);

    const YESTERDAY = new Date(TODAY.getTime() - 86400000);
    const TWO_DAYS_AGO = new Date(TODAY.getTime() - 86400000 * 2);
    const THREE_DAYS_AGO = new Date(TODAY.getTime() - 86400000 * 3);

    it('handles a fresh user with 0 questions attempted', async () => {
      vi.mocked(prisma.aptitudeQuestion.count).mockResolvedValue(100);
      vi.mocked(prisma.studentAptitudeProgress.findMany).mockResolvedValue([]);

      const result = await service.getProgress(1);

      expect(result.totalQuestions).toBe(100);
      expect(result.totalAnswered).toBe(0);
      expect(result.totalCorrect).toBe(0);
      expect(result.currentStreak).toBe(0);
    });

    it('computes correct totals for all correct answers', async () => {
      vi.mocked(prisma.aptitudeQuestion.count).mockResolvedValue(100);
      vi.mocked(prisma.studentAptitudeProgress.findMany).mockResolvedValue([
        { correct: true, lastPracticedAt: TODAY },
        { correct: true, lastPracticedAt: TODAY },
      ] as any);

      const result = await service.getProgress(1);

      expect(result.totalAnswered).toBe(2);
      expect(result.totalCorrect).toBe(2);
    });

    it('computes correct totals for all incorrect answers', async () => {
      vi.mocked(prisma.aptitudeQuestion.count).mockResolvedValue(100);
      vi.mocked(prisma.studentAptitudeProgress.findMany).mockResolvedValue([
        { correct: false, lastPracticedAt: TODAY },
        { correct: false, lastPracticedAt: TODAY },
      ] as any);

      const result = await service.getProgress(1);

      expect(result.totalAnswered).toBe(2);
      expect(result.totalCorrect).toBe(0);
    });

    it('calculates streak correctly if practiced today, yesterday, and two days ago', async () => {
      vi.mocked(prisma.aptitudeQuestion.count).mockResolvedValue(100);
      vi.mocked(prisma.studentAptitudeProgress.findMany).mockResolvedValue([
        { correct: true, lastPracticedAt: TODAY },
        { correct: false, lastPracticedAt: YESTERDAY },
        { correct: true, lastPracticedAt: TWO_DAYS_AGO },
      ] as any);

      const result = await service.getProgress(1);
      
      // Streak should be 3
      expect(result.currentStreak).toBe(3);
    });

    it('streak falls back to 0 if yesterday and today were missed', async () => {
      vi.mocked(prisma.aptitudeQuestion.count).mockResolvedValue(100);
      vi.mocked(prisma.studentAptitudeProgress.findMany).mockResolvedValue([
        { correct: true, lastPracticedAt: TWO_DAYS_AGO },
        { correct: true, lastPracticedAt: THREE_DAYS_AGO },
      ] as any);

      const result = await service.getProgress(1);
      
      // Expected today or yesterday. The latest is two days ago, so streak breaks.
      expect(result.currentStreak).toBe(0);
    });
  });

  describe('submitAnswer (Progress Upsert semantics)', () => {
    it('throws if question does not exist', async () => {
      vi.mocked(prisma.aptitudeQuestion.findUnique).mockResolvedValue(null);
      await expect(service.submitAnswer(1, 999, 'A')).rejects.toThrow('Question not found');
    });

    it('upserts best/latest score correctly for a correct answer', async () => {
      // 1. Setup mock question
      vi.mocked(prisma.aptitudeQuestion.findUnique).mockResolvedValue({
        id: 10,
        topicId: 5,
        correctAnswer: 'C',
        explanation: 'Because C is correct',
      } as any);

      // 2. Setup mock topic state (previous difficulty)
      vi.mocked(prisma.studentAptitudeTopicProgress.findUnique).mockResolvedValue({
        currentDifficulty: 'MEDIUM'
      } as any);

      // 3. Setup the pure function mock
      vi.mocked(difficultyHelpers.applyAptitudeDifficultyChange).mockReturnValue({
        next: 'HARD',
        difficultyChange: 'INCREASED'
      } as any);

      // Execute
      const result = await service.submitAnswer(1, 10, 'C');

      // Assertions
      expect(result.correct).toBe(true);
      expect(result.correctAnswer).toBe('C');
      expect(result.previousDifficulty).toBe('MEDIUM');
      expect(result.currentDifficulty).toBe('HARD');

      // Verify Upserts: Should set correct: true
      expect(vi.mocked(prisma.studentAptitudeProgress.upsert)).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ answered: true, correct: true }),
          update: expect.objectContaining({ answered: true, correct: true }),
        })
      );

      // Verify Topic difficulty upserted
      expect(vi.mocked(prisma.studentAptitudeTopicProgress.upsert)).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ currentDifficulty: 'HARD' }),
          update: expect.objectContaining({ currentDifficulty: 'HARD' }),
        })
      );
    });

    it('upserts correctly for an incorrect answer', async () => {
      vi.mocked(prisma.aptitudeQuestion.findUnique).mockResolvedValue({
        id: 10,
        topicId: 5,
        correctAnswer: 'A',
        explanation: 'Because A is correct',
      } as any);

      vi.mocked(prisma.studentAptitudeTopicProgress.findUnique).mockResolvedValue({
        currentDifficulty: 'HARD'
      } as any);

      vi.mocked(difficultyHelpers.applyAptitudeDifficultyChange).mockReturnValue({
        next: 'MEDIUM',
        difficultyChange: 'DECREASED'
      } as any);

      const result = await service.submitAnswer(1, 10, 'B'); // Wrong answer

      expect(result.correct).toBe(false);
      expect(result.correctAnswer).toBe('A');

      // Verify Upserts: Should set correct: false
      expect(vi.mocked(prisma.studentAptitudeProgress.upsert)).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ answered: true, correct: false }),
          update: expect.objectContaining({ answered: true, correct: false }),
        })
      );
    });
  });
});