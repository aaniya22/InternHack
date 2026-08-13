// Local keyword matching between a job description and the user's InternHack
// profile. Runs entirely in the content script: no network call, no AI, so the
// match is instant and works even when the user has no OpenRouter key.
//
// The repo has no shared skill vocabulary to reuse (skills live in the DB as
// skillTest rows, and job skills are AI-extracted server-side), so the list
// below is the extension's own, kept deliberately to concrete, checkable terms.
import type { ExtensionProfile, ResumeMatch } from "./types";

// [canonical label, ...aliases matched case-insensitively in the text]
const VOCABULARY: string[][] = [
  // Languages
  ["JavaScript", "javascript", "js", "ecmascript", "es6"],
  ["TypeScript", "typescript", "ts"],
  ["Python", "python"],
  ["Java", "java"],
  ["C++", "c++", "cpp"],
  ["C#", "c#", "csharp", ".net", "dotnet"],
  ["Go", "golang", "go lang"],
  ["Rust", "rust"],
  ["Ruby", "ruby"],
  ["PHP", "php"],
  ["Swift", "swift"],
  ["Kotlin", "kotlin"],
  ["Scala", "scala"],
  ["R", "r language"],
  ["SQL", "sql"],
  ["Bash", "bash", "shell scripting"],
  ["HTML", "html", "html5"],
  ["CSS", "css", "css3"],
  ["Solidity", "solidity"],

  // Frontend
  ["React", "react", "react.js", "reactjs"],
  ["Next.js", "next.js", "nextjs"],
  ["Angular", "angular", "angularjs"],
  ["Vue", "vue", "vue.js", "vuejs"],
  ["Svelte", "svelte", "sveltekit"],
  ["Redux", "redux"],
  ["Tailwind CSS", "tailwind", "tailwindcss"],
  ["Bootstrap", "bootstrap"],
  ["SASS", "sass", "scss"],
  ["Webpack", "webpack"],
  ["Vite", "vite"],
  ["React Native", "react native"],
  ["Flutter", "flutter"],
  ["Android", "android"],
  ["iOS", "ios"],

  // Backend
  ["Node.js", "node.js", "nodejs", "node js"],
  ["Express", "express", "express.js", "expressjs"],
  ["NestJS", "nestjs", "nest.js"],
  ["Django", "django"],
  ["Flask", "flask"],
  ["FastAPI", "fastapi"],
  ["Spring Boot", "spring boot", "springboot", "spring"],
  ["Rails", "rails", "ruby on rails"],
  ["Laravel", "laravel"],
  ["GraphQL", "graphql"],
  ["REST API", "rest api", "restful", "rest apis"],
  ["gRPC", "grpc"],
  ["WebSockets", "websocket", "websockets"],
  ["Microservices", "microservice", "microservices"],

  // Data
  ["PostgreSQL", "postgresql", "postgres"],
  ["MySQL", "mysql"],
  ["MongoDB", "mongodb", "mongo"],
  ["Redis", "redis"],
  ["Elasticsearch", "elasticsearch", "elastic search"],
  ["DynamoDB", "dynamodb"],
  ["Cassandra", "cassandra"],
  ["Snowflake", "snowflake"],
  ["Kafka", "kafka"],
  ["RabbitMQ", "rabbitmq"],
  ["Spark", "apache spark", "pyspark"],
  ["Hadoop", "hadoop"],
  ["Airflow", "airflow"],
  ["ETL", "etl"],
  ["Data Modeling", "data modeling", "data modelling"],
  ["Prisma", "prisma"],
  ["SQLAlchemy", "sqlalchemy"],
  ["Data Structures", "data structures"],
  ["Algorithms", "algorithms"],

  // Cloud / infra
  ["AWS", "aws", "amazon web services"],
  ["Azure", "azure"],
  ["GCP", "gcp", "google cloud"],
  ["Docker", "docker"],
  ["Kubernetes", "kubernetes", "k8s"],
  ["Terraform", "terraform"],
  ["Jenkins", "jenkins"],
  ["CI/CD", "ci/cd", "cicd", "continuous integration", "continuous deployment"],
  ["Linux", "linux", "unix"],
  ["Nginx", "nginx"],
  ["Serverless", "serverless", "lambda"],
  ["Vercel", "vercel"],
  ["Git", "git", "github", "gitlab", "version control"],
  ["Monitoring", "monitoring", "observability", "datadog", "prometheus", "grafana"],

  // AI / ML
  ["Machine Learning", "machine learning", "ml"],
  ["Deep Learning", "deep learning"],
  ["NLP", "nlp", "natural language processing"],
  ["Computer Vision", "computer vision", "opencv"],
  ["TensorFlow", "tensorflow"],
  ["PyTorch", "pytorch"],
  ["scikit-learn", "scikit-learn", "sklearn"],
  ["Pandas", "pandas"],
  ["NumPy", "numpy"],
  ["LLM", "llm", "large language model", "generative ai", "genai"],
  ["RAG", "rag", "retrieval augmented generation"],
  ["Data Analysis", "data analysis", "data analytics"],
  ["Tableau", "tableau"],
  ["Power BI", "power bi", "powerbi"],
  ["Excel", "excel"],

  // Practice / process
  ["Testing", "unit testing", "unit tests", "integration testing", "test automation"],
  ["Jest", "jest"],
  ["Cypress", "cypress"],
  ["Playwright", "playwright"],
  ["Selenium", "selenium"],
  ["Pytest", "pytest"],
  ["Agile", "agile", "scrum", "kanban"],
  ["System Design", "system design", "distributed systems"],
  ["Object Oriented Programming", "object oriented", "oop"],
  ["Code Review", "code review", "code reviews"],
  ["Debugging", "debugging", "troubleshooting"],
  ["Performance Optimization", "performance optimization", "performance tuning", "scalability"],
  ["Security", "security", "authentication", "authorization", "oauth", "jwt"],
  ["Accessibility", "accessibility", "a11y", "wcag"],
  ["Responsive Design", "responsive design", "responsive"],
  ["Figma", "figma"],
  ["UI/UX", "ui/ux", "user experience", "ux design"],
  ["Jira", "jira"],
  ["Documentation", "documentation", "technical writing"],

  // Role / soft skills that recruiters screen on
  ["Communication", "communication", "communicate effectively"],
  ["Collaboration", "collaboration", "cross-functional", "cross functional", "teamwork"],
  ["Problem Solving", "problem solving", "problem-solving"],
  ["Ownership", "ownership", "self-starter", "self starter"],
  ["Mentoring", "mentoring", "mentorship"],
  ["Stakeholder Management", "stakeholder", "stakeholders"],
  ["Product Sense", "product sense", "product thinking"],
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-ish boundaries that still allow the trailing characters real tech names
// use, so "c++" and "node.js" match without "java" matching "javascript".
function aliasPattern(alias: string) {
  return new RegExp(`(^|[^a-z0-9+#.])${escapeRegExp(alias)}([^a-z0-9+#]|$)`, "i");
}

const COMPILED = VOCABULARY.map(([label, ...aliases]) => ({
  label,
  // A single-word canonical label is itself a valid alias.
  patterns: (aliases.length ? aliases : [label.toLowerCase()]).map(aliasPattern),
}));

function normalize(text: string) {
  return ` ${text.replace(/\s+/g, " ").toLowerCase()} `;
}

function matches(haystack: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(haystack));
}

/** Every vocabulary term the job description actually asks for. */
export function extractJobKeywords(jobDescription: string, limit = 24): string[] {
  const haystack = normalize(jobDescription);
  const found: string[] = [];
  for (const entry of COMPILED) {
    if (matches(haystack, entry.patterns)) found.push(entry.label);
    if (found.length >= limit) break;
  }
  return found;
}

/**
 * Everything the profile can evidence: skills, bio, projects, education and
 * experience entries all count as resume text, since they are what InternHack
 * writes into a generated resume.
 */
export function buildProfileCorpus(profile: ExtensionProfile): string {
  const { user, applicationProfile } = profile;
  const parts: string[] = [
    user.name,
    user.bio || "",
    user.college || "",
    user.skills.join(" "),
    // Projects, education and experience are free-form JSON: stringify rather
    // than guess at their shape, since only keyword presence matters here.
    JSON.stringify(user.projects ?? ""),
    JSON.stringify(applicationProfile?.education ?? ""),
    JSON.stringify(applicationProfile?.experience ?? ""),
    JSON.stringify(applicationProfile?.customFields ?? ""),
  ];
  return parts.filter(Boolean).join(" ");
}

/** Scores the job description's keywords against the profile corpus. */
export function computeResumeMatch(jobDescription: string, profile: ExtensionProfile): ResumeMatch {
  const keywords = extractJobKeywords(jobDescription);
  const corpus = normalize(buildProfileCorpus(profile));

  const matched: string[] = [];
  const missing: string[] = [];
  for (const keyword of keywords) {
    const entry = COMPILED.find((candidate) => candidate.label === keyword);
    if (entry && matches(corpus, entry.patterns)) matched.push(keyword);
    else missing.push(keyword);
  }

  return {
    score: keywords.length ? Math.round((matched.length / keywords.length) * 100) : 0,
    total: keywords.length,
    matched,
    missing,
  };
}
