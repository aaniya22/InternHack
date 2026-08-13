import { Prisma } from "@prisma/client";
import { prisma } from "../../database/db.js";
import { jobIndexService } from "../job-index/job-index.service.js";
import { cacheGet, cacheSet, cacheDel, cacheDelPattern } from "../../utils/cache.js";
import type { PlanTier } from "../../config/usage-limits.js";

const prefKey = (id: number) => `job-pref:${id}`;
const FEED_TTL = 300; // 5 minutes TTL for feed data

export interface JobFeedResponse {
  matches: {
    matchId: number;
    score: number;
    skillMatch: number;
    locationMatch: number;
    salaryMatch: number;
    saved: boolean;
    seen: boolean;
    job: {
      id: number;
      title: string;
      company: string;
      location: string;
      salary: string | null;
      skills: string[];
      workMode: string | null;
      experienceLevel: string | null;
      applicationUrl: string | null;
      tags: string[];
      domain: string | null;
      createdAt: Date;
    };
  }[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

async function invalidateFeedCache(userId: number) {
  await Promise.all(
    ["FREE", "PREMIUM"].map((tier) =>
      cacheDelPattern(`job-feed:list:${tier}:${userId}:`),
    ),
  );
}

export class JobFeedService {
  async getFeed(userId: number, page = 1, limit = 10, tier: PlanTier = "FREE") {
    const cacheKey = `job-feed:list:${tier}:${userId}:${page}:${limit}`;
    const cached = await cacheGet<JobFeedResponse>(cacheKey);
    if (cached) return cached;

    const skip = (page - 1) * limit;

    const [matches, total] = await Promise.all([
      prisma.jobMatch.findMany({
        where: { userId, dismissed: false },
        include: { jobIndex: true },
        orderBy: { score: "desc" },
        skip,
        take: limit,
      }),
      prisma.jobMatch.count({ where: { userId, dismissed: false } }),
    ]);

    const result: JobFeedResponse = {
      matches: matches.map((m: any) => ({
        matchId: m.id,
        score: Math.round(m.score * 100),
        skillMatch: Math.round(m.skillMatch * 100),
        locationMatch: Math.round(m.locationMatch * 100),
        salaryMatch: Math.round(m.salaryMatch * 100),
        saved: m.saved,
        seen: m.seen,
        job: {
          id: m.jobIndex.id,
          title: m.jobIndex.title,
          company: m.jobIndex.company,
          location: m.jobIndex.location,
          salary: m.jobIndex.salary,
          skills: m.jobIndex.skills,
          workMode: m.jobIndex.workMode,
          experienceLevel: m.jobIndex.experienceLevel,
          applicationUrl: m.jobIndex.applicationUrl,
          tags: m.jobIndex.tags,
          domain: m.jobIndex.domain,
          createdAt: m.jobIndex.createdAt,
        },
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };

    await cacheSet(cacheKey, result, FEED_TTL);
    return result;
  }

  async dismiss(userId: number, matchId: number) {
    const match = await prisma.jobMatch.findFirst({ where: { id: matchId, userId } });
    if (!match) return;

    await prisma.jobMatch.update({
      where: { id: matchId },
      data: { dismissed: true },
    });

    await prisma.userJobPreference.update({
      where: { userId },
      data: { dismissedJobIds: { push: match.jobIndexId } },
    }).catch((err) => {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        return;
      }
      throw err;
    });

    // Invalidate the feed cache so the dismissed job disappears immediately
    await invalidateFeedCache(userId);
  }

  async save(userId: number, matchId: number) {
    await prisma.jobMatch.updateMany({
      where: { id: matchId, userId },
      data: { saved: true },
    });
    
    // Invalidate caches
    await invalidateFeedCache(userId);
  }

  async markSeen(userId: number, matchId: number) {
    await prisma.jobMatch.updateMany({
      where: { id: matchId, userId },
      data: { seen: true },
    });
    
    // Invalidate caches
    await invalidateFeedCache(userId);
  }

  async getSaved(userId: number) {
    const matches = await prisma.jobMatch.findMany({
      where: { userId, saved: true },
      include: { jobIndex: true },
      orderBy: { createdAt: "desc" },
    });

    return matches.map((m: any) => ({
      matchId: m.id,
      score: Math.round(m.score * 100),
      job: {
        id: m.jobIndex.id,
        title: m.jobIndex.title,
        company: m.jobIndex.company,
        location: m.jobIndex.location,
        salary: m.jobIndex.salary,
        skills: m.jobIndex.skills,
        workMode: m.jobIndex.workMode,
        applicationUrl: m.jobIndex.applicationUrl,
        tags: m.jobIndex.tags,
        createdAt: m.jobIndex.createdAt,
      },
    }));
  }

  async getPreferences(userId: number) {
    const cached = await cacheGet(prefKey(userId));
    if (cached) return cached as never;

    const pref = await prisma.userJobPreference.findUnique({ where: { userId } });
    await cacheSet(prefKey(userId), pref, 3600);
    return pref;
  }

  async updatePreferences(
    userId: number,
    data: {
      desiredRoles?: string[];
      desiredSkills?: string[];
      desiredLocations?: string[];
      minSalary?: number | null;
      workMode?: string[];
      experienceLevel?: string[];
      domains?: string[];
    },
  ) {
    const pref = await prisma.userJobPreference.upsert({
      where: { userId },
      create: { userId, ...data, hasEmbedding: false },
      update: { ...data, hasEmbedding: false },
    });

    // Re-generate embedding asynchronously
    jobIndexService.generateUserEmbedding(userId).catch((err) => console.error("Failed to generate user embedding:", err));

    await cacheDel(prefKey(userId));
    // Also clear the feed cache because their new preferences will change their matches
    await invalidateFeedCache(userId);
    
    return pref;
  }

  async getStats(userId: number) {
    const [total, unseen, saved] = await Promise.all([
      prisma.jobMatch.count({ where: { userId, dismissed: false } }),
      prisma.jobMatch.count({ where: { userId, dismissed: false, seen: false } }),
      prisma.jobMatch.count({ where: { userId, saved: true } }),
    ]);
    return { total, unseen, saved };
  }
}

export const jobFeedService = new JobFeedService();