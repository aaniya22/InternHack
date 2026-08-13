import { describe, it, expect, beforeEach } from 'vitest';
import { JobMatchingService } from '../job-matching.service.js';

describe('JobMatchingService - Scoring & Ranking', () => {
  let service: JobMatchingService;

  beforeEach(() => {
    service = new JobMatchingService();
  });

  const basePref = {
    desiredSkills: [],
    profileSkills: [],
    desiredLocations: [],
    workMode: [],
    minSalary: null,
    dismissedJobIds: [],
  };

  const baseJob = {
    id: 1,
    skills: [],
    location: 'Unknown',
    workMode: null,
    salaryMin: null,
    salaryMax: null,
    createdAt: new Date(),
  };

  describe('computeMatch edge cases (empty preferences)', () => {
    it('returns baseline scores when preferences are completely empty', () => {
      const result = service.computeMatch(basePref, baseJob, 0.5);
      
      // Vector: 0.4 * 0.5 = 0.2
      // Skill: empty pref -> 0.5 * 0.3 = 0.15
      // Location: empty pref -> 0.5 * 0.15 = 0.075
      // Salary: empty pref -> 0.5 * 0.1 = 0.05
      // Freshness: brand new -> 1.0 * 0.05 = 0.05
      // Total: 0.2 + 0.15 + 0.075 + 0.05 + 0.05 = 0.525
      
      expect(result.score).toBeCloseTo(0.525, 3);
      expect(result.skillMatch).toBe(0.5);
      expect(result.locationMatch).toBe(0.5);
      expect(result.salaryMatch).toBe(0.5);
      expect(result.vectorScore).toBe(0.5);
    });
  });

  describe('computeSkillMatch logic', () => {
    it('calculates partial and full overlap case-insensitively', () => {
      const pref = { 
        ...basePref, 
        profileSkills: ['react', 'TypeScript'], 
        desiredSkills: ['Node.js'] 
      };
      
      const exactJob = { ...baseJob, skills: ['REACT', 'typescript', 'NODE.JS', 'docker'] };
      const partialJob = { ...baseJob, skills: ['React', 'Python'] };

      const exactMatch = service.computeMatch(pref, exactJob, 0.8);
      const partialMatch = service.computeMatch(pref, partialJob, 0.8);

      // 3 out of 3 skills matched = 1.0
      expect(exactMatch.skillMatch).toBe(1.0);
      
      // 1 out of 3 skills matched = 0.333
      expect(partialMatch.skillMatch).toBeCloseTo(0.333, 2);
    });
  });

  describe('computeLocationMatch logic', () => {
    it('matches remote work or specific cities', () => {
      const pref = { ...basePref, workMode: ['REMOTE'], desiredLocations: ['Mumbai'] };
      
      // Matches remote
      const remoteJob = { ...baseJob, workMode: 'REMOTE', location: 'Anywhere' };
      expect(service.computeMatch(pref, remoteJob, 0.8).locationMatch).toBe(1.0);

      // Matches city
      const cityJob = { ...baseJob, workMode: 'HYBRID', location: 'Navi Mumbai, India' };
      expect(service.computeMatch(pref, cityJob, 0.8).locationMatch).toBe(1.0);

      // Matches neither
      const noMatchJob = { ...baseJob, workMode: 'ONSITE', location: 'Delhi' };
      expect(service.computeMatch(pref, noMatchJob, 0.8).locationMatch).toBe(0.0);
    });
  });

  describe('computeSalaryMatch logic', () => {
    it('awards points based on salary thresholds', () => {
      const pref = { ...basePref, minSalary: 100000 };

      // Exceeds min salary
      const greatJob = { ...baseJob, salaryMin: 110000, salaryMax: 150000 };
      expect(service.computeMatch(pref, greatJob, 0.8).salaryMatch).toBe(1.0);

      // Within 80% fallback
      const okayJob = { ...baseJob, salaryMin: 85000, salaryMax: 95000 };
      expect(service.computeMatch(pref, okayJob, 0.8).salaryMatch).toBe(0.5);

      // Too low
      const badJob = { ...baseJob, salaryMin: 50000, salaryMax: 70000 };
      expect(service.computeMatch(pref, badJob, 0.8).salaryMatch).toBe(0.0);
    });
  });

  describe('freshnessBoost logic', () => {
    it('decays the freshness multiplier over 7 days (168 hours)', () => {
      const now = Date.now();
      
      const newJob = { ...baseJob, createdAt: new Date(now) };
      const threeDaysOld = { ...baseJob, createdAt: new Date(now - 3 * 24 * 3600000) };
      const sevenDaysOld = { ...baseJob, createdAt: new Date(now - 7 * 24 * 3600000) };
      const twoWeeksOld = { ...baseJob, createdAt: new Date(now - 14 * 24 * 3600000) };

      const scoreNew = service.computeMatch(basePref, newJob, 0.5).score;
      const scoreMid = service.computeMatch(basePref, threeDaysOld, 0.5).score;
      const scoreSeven = service.computeMatch(basePref, sevenDaysOld, 0.5).score;
      const scoreOld = service.computeMatch(basePref, twoWeeksOld, 0.5).score;

      expect(scoreNew).toBeGreaterThan(scoreMid);
      expect(scoreMid).toBeGreaterThan(scoreSeven);
      
      // After exactly 7 days, freshness boost should hit 0, capping the decay. 
      // 7-day old job should perfectly equal the 14-day and 30-day old jobs.
      expect(scoreSeven).toBe(scoreOld);
      expect(scoreOld).toBe(service.computeMatch(basePref, { ...baseJob, createdAt: new Date(now - 30 * 24 * 3600000) }, 0.5).score);
    });
  });

  describe('Deterministic Ordering', () => {
    it('ranks jobs accurately based on combined weighted scores and tie-breakers', () => {
      const pref = {
        desiredSkills: ['Python', 'Django'],
        profileSkills: ['AWS'],
        desiredLocations: ['Bangalore'],
        workMode: ['HYBRID'],
        minSalary: 120000,
        dismissedJobIds: [],
      };

      const jobs = [
        // Job A: Perfect match, high vector similarity, great pay, new
        {
          job: { ...baseJob, id: 1, skills: ['Python', 'Django', 'AWS'], location: 'Bangalore', workMode: 'HYBRID', salaryMin: 130000, salaryMax: 180000, createdAt: new Date() },
          vectorSimilarity: 0.95
        },
        // Job B: Good vector similarity, but terrible pay, no location match
        {
          job: { ...baseJob, id: 2, skills: ['Python'], location: 'Delhi', workMode: 'ONSITE', salaryMin: 60000, salaryMax: 80000, createdAt: new Date(Date.now() - 4 * 24 * 3600000) },
          vectorSimilarity: 0.80
        },
        // Job C: Bad vector similarity, no skills match, decent pay
        {
          job: { ...baseJob, id: 3, skills: ['Java', 'Spring'], location: 'Bangalore', workMode: 'ONSITE', salaryMin: 120000, salaryMax: 150000, createdAt: new Date() },
          vectorSimilarity: 0.20
        },
        // Job D: Exact tie with Job C in terms of score inputs to test the tie-breaker
        {
          job: { ...baseJob, id: 4, skills: ['Java', 'Spring'], location: 'Bangalore', workMode: 'ONSITE', salaryMin: 120000, salaryMax: 150000, createdAt: new Date() },
          vectorSimilarity: 0.20
        }
      ];

      const scored = jobs.map(j => ({
        id: j.job.id,
        ...service.computeMatch(pref, j.job, j.vectorSimilarity)
      }));

      // Sort descending by score, tie-break by ID descending
      scored.sort((a, b) => b.score - a.score || b.id - a.id);

      // Expect Order: 1 (Perfect), 2 (Good vector), 4 (Tie-breaker ID desc), 3 (Tie-breaker ID desc)
      expect(scored[0].id).toBe(1);
      expect(scored[1].id).toBe(2);
      expect(scored[2].id).toBe(4);
      expect(scored[3].id).toBe(3);

      // Verify the tied scores are exactly equal
      expect(scored[2].score).toBe(scored[3].score);

      // Job 1 should have perfect component scores
      expect(scored[0].skillMatch).toBe(1.0);
      expect(scored[0].locationMatch).toBe(1.0);
      expect(scored[0].salaryMatch).toBe(1.0);
      expect(scored[0].score).toBeGreaterThan(0.9);
      
      // Job 3 & 4 should have zero skill match
      expect(scored[2].skillMatch).toBe(0.0);
    });
  });
});