import { prisma } from "../../database/db.js";

interface MatchScores {
  score: number;
  skillMatch: number;
  locationMatch: number;
  salaryMatch: number;
  vectorScore: number;
}

export class JobMatchingService {
  computeMatch(
    pref: {
      desiredSkills: string[];
      profileSkills: string[];
      desiredLocations: string[];
      workMode: string[];
      minSalary: number | null;
      dismissedJobIds: number[];
    },
    job: {
      id: number;
      skills: string[];
      location: string;
      workMode: string | null;
      salaryMin: number | null;
      salaryMax: number | null;
      createdAt: Date;
    },
    vectorSimilarity: number,
  ): MatchScores {
    const skillMatch = this.computeSkillMatch(pref, job);
    const locationMatch = this.computeLocationMatch(pref, job);
    const salaryMatch = this.computeSalaryMatch(pref, job);

    const score =
      0.4 * vectorSimilarity +
      0.3 * skillMatch +
      0.15 * locationMatch +
      0.1 * salaryMatch +
      0.05 * this.freshnessBoost(job.createdAt);

    return {
      score: Math.min(1, Math.max(0, score)),
      skillMatch,
      locationMatch,
      salaryMatch,
      vectorScore: vectorSimilarity,
    };
  }

  private computeSkillMatch(
    pref: { desiredSkills: string[]; profileSkills: string[] },
    job: { skills: string[] },
  ): number {
    const userSkills = new Set(
      [...pref.desiredSkills, ...pref.profileSkills].map((s) => s.toLowerCase()),
    );
    if (userSkills.size === 0) return 0.5;
    const jobSkills = job.skills.map((s) => s.toLowerCase());
    const overlap = jobSkills.filter((s) => userSkills.has(s)).length;
    return Math.min(1, overlap / Math.max(1, Math.min(userSkills.size, 5)));
  }

  private computeLocationMatch(
    pref: { desiredLocations: string[]; workMode: string[] },
    job: { location: string; workMode: string | null },
  ): number {
    if (pref.desiredLocations.length === 0 && pref.workMode.length === 0) return 0.5;
    if (pref.workMode.includes("REMOTE") && job.workMode === "REMOTE") return 1.0;
    const match = pref.desiredLocations.some((loc) =>
      job.location.toLowerCase().includes(loc.toLowerCase()),
    );
    return match ? 1.0 : 0.0;
  }

  private computeSalaryMatch(
    pref: { minSalary: number | null },
    job: { salaryMin: number | null; salaryMax: number | null },
  ): number {
    if (!pref.minSalary || !job.salaryMax) return 0.5;
    if (job.salaryMax >= pref.minSalary) return 1.0;
    if (job.salaryMin && job.salaryMin >= pref.minSalary * 0.8) return 0.5;
    return 0.0;
  }

  private freshnessBoost(createdAt: Date): number {
    const ageHours = (Date.now() - createdAt.getTime()) / 3600000;
    return Math.max(0, 1 - ageHours / 168);
  }

  async generateMatches(hoursBack = 6): Promise<number> {
    const cutoff = new Date(Date.now() - hoursBack * 3600000);

    const users = await prisma.userJobPreference.findMany({
      where: { hasEmbedding: true },
      select: {
        userId: true,
        desiredSkills: true,
        profileSkills: true,
        desiredLocations: true,
        workMode: true,
        minSalary: true,
        dismissedJobIds: true,
      },
    });

    if (users.length === 0) return 0;

    const allJobIds = new Set<number>();
    const userMatches = new Map<number, Array<{ id: number; similarity: number }>>();

    // 1. Gather all vector searches (must remain per-user due to the `<=>` distance operator)
    for (const pref of users) {
      try {
        const results = await prisma.$queryRawUnsafe<Array<{ id: number; similarity: number }>>(
          `SELECT ji.id, 1 - (ji.embedding <=> up.embedding) AS similarity
           FROM "jobIndex" ji, "userJobPreference" up
           WHERE up."userId" = $1
             AND ji."isActive" = true
             AND ji."hasEmbedding" = true
             AND ji."createdAt" >= $2
             AND ji.id NOT IN (
               SELECT "jobIndexId" FROM "jobMatch" WHERE "userId" = $1
             )
           ORDER BY ji.embedding <=> up.embedding
           LIMIT 20`,
          pref.userId,
          cutoff,
        );

        if (results.length > 0) {
          userMatches.set(pref.userId, results);
          for (const r of results) allJobIds.add(r.id);
        }
      } catch (err) {
        // pgvector / embedding columns not set up yet — but also logs unexpected failures
        console.error(`generateMatches: vector search failed for user ${pref.userId}`, err);
      }
    }

    if (allJobIds.size === 0) return 0;

    // 2. Batch the reads for jobs, chunked to respect Postgres parameter limits
    const READ_CHUNK_SIZE = 1000;
    const jobIdList = Array.from(allJobIds);
    const jobMap = new Map<number, any>();
    
    for (let i = 0; i < jobIdList.length; i += READ_CHUNK_SIZE) {
      const chunk = jobIdList.slice(i, i + READ_CHUNK_SIZE);
      const jobs = await prisma.jobIndex.findMany({ where: { id: { in: chunk } } });
      for (const j of jobs) jobMap.set(j.id, j);
    }

    // 3. Compute matches and candidate records in memory
    const matchCandidates: Array<{
      userId: number;
      jobIndexId: number;
      score: number;
      skillMatch: number;
      locationMatch: number;
      salaryMatch: number;
      vectorScore: number;
    }> = [];

    for (const pref of users) {
      const results = userMatches.get(pref.userId) || [];
      for (const row of results) {
        const job = jobMap.get(row.id);
        if (!job) continue;

        const scores = this.computeMatch(pref, job, row.similarity);
        if (scores.score < 0.3 || pref.dismissedJobIds.includes(job.id)) continue;

        matchCandidates.push({
          userId: pref.userId,
          jobIndexId: job.id,
          ...scores,
        });
      }
    }

    if (matchCandidates.length === 0) return 0;

    // 4. Batch fetch existing records to compute diffs in memory (Chunked OR query)
    const existingMatches = new Set<string>();
    
    for (let i = 0; i < matchCandidates.length; i += READ_CHUNK_SIZE) {
      const chunk = matchCandidates.slice(i, i + READ_CHUNK_SIZE);
      const existing = await prisma.jobMatch.findMany({
        where: { OR: chunk.map((c) => ({ userId: c.userId, jobIndexId: c.jobIndexId })) },
        select: { userId: true, jobIndexId: true },
      });
      for (const e of existing) {
        existingMatches.add(`${e.userId}-${e.jobIndexId}`);
      }
    }

    // 5. Separate candidates into Creates and Updates
    const toCreate = [];
    const toUpdate = [];

    for (const c of matchCandidates) {
      if (existingMatches.has(`${c.userId}-${c.jobIndexId}`)) {
        toUpdate.push(c);
      } else {
        toCreate.push(c);
      }
    }

    let matchCount = 0;

    // 6. Apply writes efficiently
    
    // Bulk insert new records with skipDuplicates for race condition safety
    if (toCreate.length > 0) {
      const createResult = await prisma.jobMatch.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
      matchCount += createResult.count;
    }

    // Apply updates in a single chunked transaction to prevent pool exhaustion
    if (toUpdate.length > 0) {
      const UPDATE_CHUNK_SIZE = 100;
      for (let i = 0; i < toUpdate.length; i += UPDATE_CHUNK_SIZE) {
        const chunk = toUpdate.slice(i, i + UPDATE_CHUNK_SIZE);
        
        const updatePromises = chunk.map((u) =>
          prisma.jobMatch.updateMany({
            where: { userId: u.userId, jobIndexId: u.jobIndexId },
            data: {
              score: u.score,
              skillMatch: u.skillMatch,
              locationMatch: u.locationMatch,
              salaryMatch: u.salaryMatch,
              vectorScore: u.vectorScore,
            },
          })
        );
        
        const updateResults = await prisma.$transaction(updatePromises);
        matchCount += updateResults.reduce((sum, result) => sum + result.count, 0);
      }
    }

    return matchCount;
  }
}