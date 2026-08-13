import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InterviewProgressService } from '../interview-progress.service.js';
import { prisma } from '../../../database/db.js';

vi.mock('../../../database/db.js', () => ({
  prisma: {
    userInterviewQuestionState: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    userInterviewProgress: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe('InterviewProgressService', () => {
  let service: InterviewProgressService;

  beforeEach(() => {
    service = new InterviewProgressService();
    vi.clearAllMocks();
  });

  describe('getProgress & aggregateProgress', () => {
    it('returns EMPTY_PROGRESS when no records exist', async () => {
      vi.mocked(prisma.userInterviewQuestionState.findMany).mockResolvedValue([]);
      vi.mocked(prisma.userInterviewProgress.findUnique).mockResolvedValue(null);

      const result = await service.getProgress(1);

      expect(result).toEqual({
        completedIds: [],
        bookmarkedIds: [],
        lastVisitedId: null,
        lastVisitedAt: null,
      });
      expect(vi.mocked(prisma.userInterviewQuestionState.findMany)).toHaveBeenCalledWith({
        where: { userId: 1 },
        select: { questionId: true, isCompleted: true, isBookmarked: true },
      });
    });

    it('correctly aggregates completed, bookmarked, and visited states', async () => {
      const mockDate = new Date('2026-07-30T00:00:00Z');
      
      vi.mocked(prisma.userInterviewQuestionState.findMany).mockResolvedValue([
        { questionId: 'q1', isCompleted: true, isBookmarked: false },
        { questionId: 'q2', isCompleted: false, isBookmarked: true },
        { questionId: 'q3', isCompleted: true, isBookmarked: true },
      ] as any);

      vi.mocked(prisma.userInterviewProgress.findUnique).mockResolvedValue({
        lastVisitedId: 'q2',
        lastVisitedAt: mockDate,
      } as any);

      const result = await service.getProgress(1);

      expect(result.completedIds).toEqual(['q1', 'q3']);
      expect(result.bookmarkedIds).toEqual(['q2', 'q3']);
      expect(result.lastVisitedId).toBe('q2');
      expect(result.lastVisitedAt).toEqual(mockDate);
    });
  });

  describe('updateProgress state transitions', () => {
    beforeEach(() => {
      // Setup default mock return for the aggregateProgress call at the end of updateProgress
      vi.mocked(prisma.userInterviewQuestionState.findMany).mockResolvedValue([]);
      vi.mocked(prisma.userInterviewProgress.findUnique).mockResolvedValue(null);
    });

    it('idempotently handles "complete" action', async () => {
      await service.updateProgress(1, 'q_test', 'complete');

      expect(vi.mocked(prisma.userInterviewQuestionState.upsert)).toHaveBeenCalledWith({
        where: { userId_questionId: { userId: 1, questionId: 'q_test' } },
        update: { isCompleted: true },
        create: { userId: 1, questionId: 'q_test', isCompleted: true },
      });
    });

    it('idempotently handles "uncomplete" action', async () => {
      await service.updateProgress(1, 'q_test', 'uncomplete');

      expect(vi.mocked(prisma.userInterviewQuestionState.upsert)).toHaveBeenCalledWith({
        where: { userId_questionId: { userId: 1, questionId: 'q_test' } },
        update: { isCompleted: false },
        create: { userId: 1, questionId: 'q_test', isCompleted: false },
      });
    });

    it('idempotently handles "bookmark" action', async () => {
      await service.updateProgress(1, 'q_test', 'bookmark');

      expect(vi.mocked(prisma.userInterviewQuestionState.upsert)).toHaveBeenCalledWith({
        where: { userId_questionId: { userId: 1, questionId: 'q_test' } },
        update: { isBookmarked: true },
        create: { userId: 1, questionId: 'q_test', isBookmarked: true },
      });
    });

    it('idempotently handles "unbookmark" action', async () => {
      await service.updateProgress(1, 'q_test', 'unbookmark');

      expect(vi.mocked(prisma.userInterviewQuestionState.upsert)).toHaveBeenCalledWith({
        where: { userId_questionId: { userId: 1, questionId: 'q_test' } },
        update: { isBookmarked: false },
        create: { userId: 1, questionId: 'q_test', isBookmarked: false },
      });
    });

    it('handles "visit" action by updating global progress', async () => {
      await service.updateProgress(1, 'q_visit', 'visit');

      expect(vi.mocked(prisma.userInterviewProgress.upsert)).toHaveBeenCalledWith({
        where: { userId: 1 },
        update: { lastVisitedId: 'q_visit', lastVisitedAt: expect.any(Date) },
        create: { userId: 1, lastVisitedId: 'q_visit', lastVisitedAt: expect.any(Date) },
      });
      // Ensure question state upsert was NOT called for a visit
      expect(vi.mocked(prisma.userInterviewQuestionState.upsert)).not.toHaveBeenCalled();
    });
  });
});