import React, { useState, useMemo } from "react";
import { Link } from "react-router";
import {
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Filter,
  Code2,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { EditorialDropdown } from "../../../components/ui/EditorialDropdown";

// Program Type Enum
export type ProgramType =
  | "OUTREACHY"
  | "LFX"
  | "MLH"
  | "SEASON_OF_DOCS"
  | "SUMMER_OF_BITCOIN"
  | "GSSOC"
  | "C4GT"
  | "OSPP"
  | "SEASON_OF_KDE"
  | "IGALIA";

interface Org {
  id: number;
  name: string;
  description: string;
  techStack: string[];
  timeline: string;
  mandatoryContributionPeriod?: string;
  cohort?: "May-August" | "December-March";
  foundation?: "CNCF" | "Linux Foundation" | "Hyperledger";
  term?: "Spring" | "Summer" | "Fall";
  difficulty?: "Beginner" | "Intermediate" | "Advanced";
  docType?: "Tutorials" | "API Reference" | "User Guides";
  /** Domain / track / team the project sits in. Criteria field for the newer programs. */
  focus?: string;
  url: string;
}

/** Org keys whose value is a plain string, usable in a dropdown or a card stat block. */
type OrgField = "cohort" | "foundation" | "term" | "docType" | "difficulty" | "focus";

interface OrgBrowserPageProps {
  programType: ProgramType;
}

const MOCK_ORGS: Record<ProgramType, Org[]> = {
  OUTREACHY: [
    {
      id: 1,
      name: "Debian",
      description: "Debian is a Unix-like operating system and a distribution of free software. Outreachy interns will work on updating packaging systems and enhancing automated package builds.",
      techStack: ["Rust", "Python", "Bash"],
      timeline: "Internship: Dec 2026 - Mar 2027",
      cohort: "December-March",
      mandatoryContributionPeriod: "Oct 2 - Oct 30, 2026",
      url: "https://www.debian.org",
    },
    {
      id: 2,
      name: "Fedora Project",
      description: "Fedora creates an innovative, free, and open-source platform. Fedora contributors are working on Python module upgrades and Cloud deployment scripts.",
      techStack: ["Python", "Go", "Ansible"],
      timeline: "Internship: May - Aug 2026",
      cohort: "May-August",
      mandatoryContributionPeriod: "Feb 5 - Mar 5, 2026",
      url: "https://getfedora.org",
    },
    {
      id: 3,
      name: "GNOME Foundation",
      description: "GNOME is a desktop environment for Linux. Work on rewriting core utilities in Rust and updating the system documentation.",
      techStack: ["JavaScript", "Rust", "Gtk"],
      timeline: "Internship: Dec 2026 - Mar 2027",
      cohort: "December-March",
      mandatoryContributionPeriod: "Oct 2 - Oct 30, 2026",
      url: "https://www.gnome.org",
    },
    {
      id: 4,
      name: "Mozilla",
      description: "Mozilla is an advocate for the open Web. Interns will work on developer tools and optimize web browser compiler backend performance.",
      techStack: ["JavaScript", "Rust", "C++"],
      timeline: "Internship: May - Aug 2026",
      cohort: "May-August",
      mandatoryContributionPeriod: "Feb 5 - Mar 5, 2026",
      url: "https://www.mozilla.org",
    },
    {
      id: 5,
      name: "Wikimedia Foundation",
      description: "Wikimedia supports free knowledge projects. Interns work on media processing modules and Wikipedia backend APIs.",
      techStack: ["PHP", "JavaScript", "Python"],
      timeline: "Internship: Dec 2026 - Mar 2027",
      cohort: "December-March",
      mandatoryContributionPeriod: "Oct 2 - Oct 30, 2026",
      url: "https://www.wikimedia.org",
    },
  ],
  LFX: [
    {
      id: 11,
      name: "Kubernetes (CNCF)",
      description: "Enable node resource metrics APIs inside kubelet. Mentees will develop metrics collectors and clean up client interfaces.",
      techStack: ["Go", "Kubernetes", "Cloud"],
      timeline: "Cohort: Mar 1 - May 31, 2026",
      foundation: "CNCF",
      term: "Spring",
      url: "https://kubernetes.io",
    },
    {
      id: 12,
      name: "Hyperledger Fabric (Hyperledger)",
      description: "Optimize peer database committing speed. Enhance LevelDB indices and bloque state synchronizers.",
      techStack: ["Go", "LevelDB", "Docker"],
      timeline: "Cohort: Jun 1 - Aug 31, 2026",
      foundation: "Hyperledger",
      term: "Summer",
      url: "https://www.hyperledger.org",
    },
    {
      id: 13,
      name: "Linux Kernel (Linux Foundation)",
      description: "eBPF subsystem test suites extensions. Write integration socket diagnostics using core assembly utilities.",
      techStack: ["C", "Assembly", "eBPF"],
      timeline: "Cohort: Oct 1 - Dec 31, 2026",
      foundation: "Linux Foundation",
      term: "Fall",
      url: "https://www.kernel.org",
    },
    {
      id: 14,
      name: "Prometheus (CNCF)",
      description: "Expand remote write storage interface to handle cache replication when remote endpoints are unavailable.",
      techStack: ["Go", "Prometheus", "Cloud"],
      timeline: "Cohort: Jun 1 - Aug 31, 2026",
      foundation: "CNCF",
      term: "Summer",
      url: "https://prometheus.io",
    },
    {
      id: 15,
      name: "Zowe (Open Mainframe)",
      description: "Mainframe telemetry plugins implementation. Construct responsive stats reporting dashboards.",
      techStack: ["TypeScript", "Java", "Node.js"],
      timeline: "Cohort: Oct 1 - Dec 31, 2026",
      foundation: "Linux Foundation",
      term: "Fall",
      url: "https://www.zowe.org",
    },
  ],
  MLH: [
    {
      id: 21,
      name: "Meta React Pod",
      description: "Develop new diagnostic dashboards inside React DevTools and optimize test environments for Server Components.",
      techStack: ["JavaScript", "TypeScript", "React"],
      timeline: "Batch: Jun 1 - Aug 24, 2026",
      term: "Summer",
      url: "https://react.dev",
    },
    {
      id: 22,
      name: "AWS Cloud Pod",
      description: "Create AWS CDK construct libraries for serverless deployment patterns and event-driven architectures.",
      techStack: ["TypeScript", "AWS CDK", "Python"],
      timeline: "Batch: Jan 15 - Apr 10, 2026",
      term: "Spring",
      url: "https://aws.amazon.com",
    },
    {
      id: 23,
      name: "Solana Web3 Pod",
      description: "Refactor Rust anchor contract architectures to minimize program footprint and serialization gas costs.",
      techStack: ["Rust", "Web3", "Anchor"],
      timeline: "Batch: Sep 15 - Dec 10, 2026",
      term: "Fall",
      url: "https://solana.com",
    },
    {
      id: 24,
      name: "Vercel Next.js Pod",
      description: "Construct Next.js router compilation profiles and diagnostic tools inside the Turbopack build engine.",
      techStack: ["Rust", "TypeScript", "Next.js"],
      timeline: "Batch: Jun 1 - Aug 24, 2026",
      term: "Summer",
      url: "https://nextjs.org",
    },
  ],
  SEASON_OF_DOCS: [
    {
      id: 31,
      name: "Apache Kafka",
      description: "Rewrite the developer quickstart guide and construct statistical benchmarks documentation for event streaming setup.",
      techStack: ["Markdown", "Java", "Shell"],
      timeline: "Program: May - Nov 2026",
      difficulty: "Intermediate",
      docType: "Tutorials",
      url: "https://kafka.apache.org",
    },
    {
      id: 32,
      name: "TensorFlow",
      description: "Revamp deep learning library reference sheets. Author Jupyter tutorial notebooks illustrating new execution layers.",
      techStack: ["Python", "Jupyter", "Sphinx"],
      timeline: "Program: May - Nov 2026",
      difficulty: "Advanced",
      docType: "API Reference",
      url: "https://www.tensorflow.org",
    },
    {
      id: 33,
      name: "Prometheus",
      description: "Create user guides for configuring alertmanager templates and building custom queries in PromQL.",
      techStack: ["Prometheus", "PromQL", "Hugo"],
      timeline: "Program: May - Nov 2026",
      difficulty: "Beginner",
      docType: "User Guides",
      url: "https://prometheus.io",
    },
    {
      id: 34,
      name: "JupyterLab",
      description: "Design extensions documentation guides. Document the API lifecycle for extension creators.",
      techStack: ["Markdown", "TypeScript", "Sphinx"],
      timeline: "Program: May - Nov 2026",
      difficulty: "Intermediate",
      docType: "User Guides",
      url: "https://jupyter.org",
    },
  ],
  SUMMER_OF_BITCOIN: [
    {
      id: 41,
      name: "Bitcoin Core",
      description: "The reference Bitcoin implementation. Interns extend the functional test suite, work on wallet internals, and profile P2P message handling.",
      techStack: ["C++", "Python", "Shell"],
      timeline: "Cohort: Jun - Aug 2026",
      focus: "Consensus & Core",
      difficulty: "Advanced",
      url: "https://bitcoincore.org",
    },
    {
      id: 42,
      name: "Lightning Network Daemon (LND)",
      description: "Lightning Labs' node implementation. Projects cover channel management tooling, gRPC interfaces, and pathfinding heuristics.",
      techStack: ["Go", "gRPC", "Protobuf"],
      timeline: "Cohort: Jun - Aug 2026",
      focus: "Lightning",
      difficulty: "Advanced",
      url: "https://lightning.engineering",
    },
    {
      id: 43,
      name: "Core Lightning (CLN)",
      description: "Blockstream's Lightning implementation. Build plugins, improve the JSON-RPC surface, and harden the payment retry logic.",
      techStack: ["C", "Python", "Rust"],
      timeline: "Cohort: Jun - Aug 2026",
      focus: "Lightning",
      difficulty: "Intermediate",
      url: "https://corelightning.org",
    },
    {
      id: 44,
      name: "Bitcoin Dev Kit (BDK)",
      description: "A library that wallet developers build on. Work on descriptor handling, coin selection strategies, and language bindings.",
      techStack: ["Rust", "Kotlin", "Swift"],
      timeline: "Cohort: Jun - Aug 2026",
      focus: "Wallets & Libraries",
      difficulty: "Intermediate",
      url: "https://bitcoindevkit.org",
    },
    {
      id: 45,
      name: "BTCPay Server",
      description: "Self-hosted payment processor. Projects include plugin architecture work, checkout UX, and point-of-sale integrations.",
      techStack: ["C#", ".NET", "JavaScript"],
      timeline: "Cohort: Jun - Aug 2026",
      focus: "Payments",
      difficulty: "Beginner",
      url: "https://btcpayserver.org",
    },
    {
      id: 46,
      name: "Fedimint",
      description: "Federated custody protocol built on Chaumian e-cash. Work spans federation modules, guardian tooling, and mobile clients.",
      techStack: ["Rust", "WASM", "TypeScript"],
      timeline: "Cohort: Jun - Aug 2026",
      focus: "Wallets & Libraries",
      difficulty: "Advanced",
      url: "https://fedimint.org",
    },
  ],
  GSSOC: [
    {
      id: 51,
      name: "Web Development Track",
      description: "The largest GSSoC track. Community-maintained React, Next.js, and Tailwind projects with issues labelled by point value.",
      techStack: ["React", "TypeScript", "Tailwind"],
      timeline: "Edition: Mar - May 2027",
      focus: "Web Development",
      difficulty: "Beginner",
      url: "https://gssoc.girlscript.tech",
    },
    {
      id: 52,
      name: "Machine Learning Track",
      description: "Notebook-driven projects: dataset cleaning, model training scripts, and Streamlit demos maintained by GSSoC project admins.",
      techStack: ["Python", "Jupyter", "scikit-learn"],
      timeline: "Edition: Mar - May 2027",
      focus: "Machine Learning",
      difficulty: "Intermediate",
      url: "https://gssoc.girlscript.tech",
    },
    {
      id: 53,
      name: "App Development Track",
      description: "Cross-platform mobile projects. Typical issues are new screens, state management refactors, and accessibility fixes.",
      techStack: ["Flutter", "Dart", "Kotlin"],
      timeline: "Edition: Mar - May 2027",
      focus: "App Development",
      difficulty: "Intermediate",
      url: "https://gssoc.girlscript.tech",
    },
    {
      id: 54,
      name: "DevOps & Cloud Track",
      description: "Containerisation, GitHub Actions pipelines, and infrastructure scripts for community projects that need a deployment story.",
      techStack: ["Docker", "GitHub Actions", "Kubernetes"],
      timeline: "Edition: Mar - May 2027",
      focus: "DevOps & Cloud",
      difficulty: "Advanced",
      url: "https://gssoc.girlscript.tech",
    },
    {
      id: 55,
      name: "Documentation & Community Track",
      description: "Lowest barrier to a first merged PR: README rewrites, contribution guides, and docs sites for GSSoC projects.",
      techStack: ["Markdown", "Docusaurus", "MDX"],
      timeline: "Edition: Mar - May 2027",
      focus: "Documentation",
      difficulty: "Beginner",
      url: "https://gssoc.girlscript.tech",
    },
  ],
  C4GT: [
    {
      id: 61,
      name: "Beckn Protocol",
      description: "Open protocol powering decentralised commerce networks such as ONDC. Contributors work on reference implementations and adapters.",
      techStack: ["TypeScript", "Node.js", "OpenAPI"],
      timeline: "Cohort: Jun - Sep 2026",
      focus: "Commerce",
      difficulty: "Intermediate",
      url: "https://becknprotocol.io",
    },
    {
      id: 62,
      name: "Sunbird",
      description: "Building block stack behind national learning platforms. Projects span content services, telemetry pipelines, and admin consoles.",
      techStack: ["Java", "Scala", "React"],
      timeline: "Cohort: Jun - Sep 2026",
      focus: "Education",
      difficulty: "Advanced",
      url: "https://sunbird.org",
    },
    {
      id: 63,
      name: "OpenG2P",
      description: "Social benefit delivery platform: beneficiary registries, payment reconciliation, and integrations with identity systems.",
      techStack: ["Python", "Odoo", "Kubernetes"],
      timeline: "Cohort: Jun - Sep 2026",
      focus: "Welfare",
      difficulty: "Intermediate",
      url: "https://openg2p.org",
    },
    {
      id: 64,
      name: "Avni",
      description: "Field data collection platform used by frontline health and welfare workers. Offline-first mobile plus rule-engine work.",
      techStack: ["Java", "React Native", "PostgreSQL"],
      timeline: "Cohort: Jun - Sep 2026",
      focus: "Health",
      difficulty: "Intermediate",
      url: "https://avniproject.org",
    },
    {
      id: 65,
      name: "Bahmni",
      description: "Hospital management system built on OpenMRS, deployed across India and Africa. Clinical modules, reporting, and FHIR support.",
      techStack: ["Java", "OpenMRS", "React"],
      timeline: "Cohort: Jun - Sep 2026",
      focus: "Health",
      difficulty: "Advanced",
      url: "https://www.bahmni.org",
    },
  ],
  OSPP: [
    {
      id: 71,
      name: "openEuler",
      description: "Server and edge Linux distribution. Tasks range from kernel feature backports to packaging automation and test frameworks.",
      techStack: ["C", "Python", "Shell"],
      timeline: "Coding: Jul - Sep 2026",
      focus: "Operating Systems",
      difficulty: "Advanced",
      url: "https://www.openeuler.org/en/",
    },
    {
      id: 72,
      name: "KubeEdge",
      description: "CNCF project extending Kubernetes to edge nodes. Projects cover device twins, edge autonomy, and cross-cluster messaging.",
      techStack: ["Go", "Kubernetes", "MQTT"],
      timeline: "Coding: Jul - Sep 2026",
      focus: "Cloud Native",
      difficulty: "Intermediate",
      url: "https://kubeedge.io",
    },
    {
      id: 73,
      name: "OpenHarmony",
      description: "Open source OS for connected devices. Contributors work on subsystems, ArkTS application samples, and porting to new boards.",
      techStack: ["C++", "ArkTS", "JavaScript"],
      timeline: "Coding: Jul - Sep 2026",
      focus: "Operating Systems",
      difficulty: "Advanced",
      url: "https://www.openharmony.cn/mainPlay",
    },
    {
      id: 74,
      name: "Apache DolphinScheduler",
      description: "Distributed workflow scheduler. Typical tasks are new task plugins, UI panels for DAG editing, and metrics exporters.",
      techStack: ["Java", "TypeScript", "Vue"],
      timeline: "Coding: Jul - Sep 2026",
      focus: "Data Infrastructure",
      difficulty: "Intermediate",
      url: "https://dolphinscheduler.apache.org",
    },
    {
      id: 75,
      name: "RT-Thread",
      description: "Real-time operating system for microcontrollers. Driver ports, component packages, and low-level debugging work.",
      techStack: ["C", "Kconfig", "Assembly"],
      timeline: "Coding: Jul - Sep 2026",
      focus: "Embedded",
      difficulty: "Advanced",
      url: "https://www.rt-thread.io",
    },
  ],
  SEASON_OF_KDE: [
    {
      id: 81,
      name: "Krita",
      description: "Digital painting application. Past SoK work includes brush engine improvements, animation tooling, and Python plugin APIs.",
      techStack: ["C++", "Qt", "Python"],
      timeline: "Mentorship: Jan - Feb 2027",
      focus: "Creative Tools",
      difficulty: "Intermediate",
      url: "https://krita.org",
    },
    {
      id: 82,
      name: "Kdenlive",
      description: "Non-linear video editor. Timeline usability, effect presets, and rendering profile work sized for a short mentorship.",
      techStack: ["C++", "Qt", "MLT"],
      timeline: "Mentorship: Jan - Feb 2027",
      focus: "Creative Tools",
      difficulty: "Intermediate",
      url: "https://kdenlive.org",
    },
    {
      id: 83,
      name: "KDE Plasma",
      description: "The Plasma desktop shell and its widgets. Projects touch QML applets, system settings modules, and Wayland session polish.",
      techStack: ["C++", "QML", "Qt"],
      timeline: "Mentorship: Jan - Feb 2027",
      focus: "Desktop",
      difficulty: "Advanced",
      url: "https://kde.org/plasma-desktop/",
    },
    {
      id: 84,
      name: "GCompris",
      description: "Educational suite for children. Adding new activities is a well-scoped first contribution with clear design guidance.",
      techStack: ["QML", "Qt", "JavaScript"],
      timeline: "Mentorship: Jan - Feb 2027",
      focus: "Education",
      difficulty: "Beginner",
      url: "https://gcompris.net",
    },
    {
      id: 85,
      name: "KDE Connect",
      description: "Pairs a phone with the desktop for notifications, file transfer, and input sharing. Work on plugins and the Android client.",
      techStack: ["C++", "Kotlin", "Qt"],
      timeline: "Mentorship: Jan - Feb 2027",
      focus: "Mobile",
      difficulty: "Intermediate",
      url: "https://kdeconnect.kde.org",
    },
  ],
  IGALIA: [
    {
      id: 91,
      name: "Web Platform (Chromium)",
      description: "Implement and test web standards in Blink. Grantees ship real interop fixes and land patches in the Chromium tree.",
      techStack: ["C++", "Web Platform Tests", "Python"],
      timeline: "Grant: Jan - Dec 2027 (part-time)",
      focus: "Browsers",
      difficulty: "Advanced",
      url: "https://www.igalia.com/coding-experience/",
    },
    {
      id: 92,
      name: "WebKit",
      description: "Layout, rendering, and JavaScriptCore work on the engine behind Safari and embedded WebKit ports.",
      techStack: ["C++", "JavaScriptCore", "GTK"],
      timeline: "Grant: Jan - Dec 2027 (part-time)",
      focus: "Browsers",
      difficulty: "Advanced",
      url: "https://www.igalia.com/coding-experience/",
    },
    {
      id: 93,
      name: "Graphics (Mesa & Vulkan)",
      description: "Open source GPU drivers and the Linux graphics stack: conformance test failures, driver features, and Wayland integration.",
      techStack: ["C", "Vulkan", "GLSL"],
      timeline: "Grant: Jan - Dec 2027 (part-time)",
      focus: "Graphics",
      difficulty: "Advanced",
      url: "https://www.igalia.com/coding-experience/",
    },
    {
      id: 94,
      name: "Multimedia (GStreamer)",
      description: "Pipelines, codecs, and hardware-accelerated playback across the GStreamer framework used by browsers and set-top boxes.",
      techStack: ["C", "GObject", "Rust"],
      timeline: "Grant: Jan - Dec 2027 (part-time)",
      focus: "Multimedia",
      difficulty: "Intermediate",
      url: "https://www.igalia.com/coding-experience/",
    },
    {
      id: 95,
      name: "Compilers & Language Runtimes",
      description: "JavaScript and WebAssembly engine internals: bytecode, JIT tiers, and specification-driven feature work.",
      techStack: ["C++", "WebAssembly", "Assembly"],
      timeline: "Grant: Jan - Dec 2027 (part-time)",
      focus: "Compilers",
      difficulty: "Advanced",
      url: "https://www.igalia.com/coding-experience/",
    },
  ],
};

const BANNER_BG =
  "bg-linear-to-r from-stone-900 to-stone-800 dark:from-stone-950 dark:to-stone-900";

interface ProgramConfig {
  title: string;
  desc: string;
  /** Drives the second filter dropdown. */
  criteriaField: OrgField;
  criteriaLabel: string;
  /** Stat blocks rendered at the foot of each card. One renders inline, two render side by side. */
  detailFields: { label: string; field: OrgField }[];
}

const PROGRAM_CONFIG: Record<ProgramType, ProgramConfig> = {
  OUTREACHY: {
    title: "Outreachy Organizations",
    desc: "Outreachy provides paid, remote internships for people subject to systemic bias in the tech industry. Interns are paired with experienced mentors in FOSS organizations.",
    criteriaField: "cohort",
    criteriaLabel: "Cohort Round",
    detailFields: [],
  },
  LFX: {
    title: "LFX Mentorship Projects",
    desc: "Linux Foundation's program connecting mentees with cloud-native, blockchain, and kernel maintainers. Work on real LF projects with global developer visibility.",
    criteriaField: "foundation",
    criteriaLabel: "Foundation",
    detailFields: [
      { label: "Foundation", field: "foundation" },
      { label: "Cohort Term", field: "term" },
    ],
  },
  MLH: {
    title: "MLH Fellowship Projects",
    desc: "A remote internship alternative where fellows collaborate in engineering pods on open-source libraries used by real-world tech companies.",
    criteriaField: "term",
    criteriaLabel: "Batch Term",
    detailFields: [{ label: "Fellowship Batch", field: "term" }],
  },
  SEASON_OF_DOCS: {
    title: "Google Season of Docs Orgs",
    desc: "Google pairs technical writers with open source organizations to improve developer documentation, API references, tutorials, and training platforms.",
    criteriaField: "docType",
    criteriaLabel: "Documentation Type",
    detailFields: [
      { label: "Doc Type", field: "docType" },
      { label: "Difficulty", field: "difficulty" },
    ],
  },
  SUMMER_OF_BITCOIN: {
    title: "Summer of Bitcoin Projects",
    desc: "A paid, global summer internship for students in Bitcoin and Lightning free software. Applicants take a screening exam, then contribute to a mentoring organization for roughly twelve weeks.",
    criteriaField: "focus",
    criteriaLabel: "Project Focus",
    detailFields: [
      { label: "Focus", field: "focus" },
      { label: "Difficulty", field: "difficulty" },
    ],
  },
  GSSOC: {
    title: "GirlScript Summer of Code Tracks",
    desc: "India's largest beginner-friendly open source program. Contributors earn points for merged pull requests across community-submitted projects, with mentors and a public leaderboard.",
    criteriaField: "focus",
    criteriaLabel: "Project Track",
    detailFields: [
      { label: "Track", field: "focus" },
      { label: "Difficulty", field: "difficulty" },
    ],
  },
  C4GT: {
    title: "Code for GovTech Projects",
    desc: "A mentorship program for digital public goods used in Indian governance: health, education, welfare, and commerce platforms deployed at population scale.",
    criteriaField: "focus",
    criteriaLabel: "Sector",
    detailFields: [
      { label: "Sector", field: "focus" },
      { label: "Difficulty", field: "difficulty" },
    ],
  },
  OSPP: {
    title: "Open Source Promotion Plan Projects",
    desc: "A summer program run by the Institute of Software, Chinese Academy of Sciences. Students worldwide take on funded tasks published by open source communities, with a coding period from July to September.",
    criteriaField: "focus",
    criteriaLabel: "Project Domain",
    detailFields: [
      { label: "Domain", field: "focus" },
      { label: "Difficulty", field: "difficulty" },
    ],
  },
  SEASON_OF_KDE: {
    title: "Season of KDE Projects",
    desc: "KDE's winter mentorship round. Lighter commitment than a summer program and open to anyone, which makes it one of the easiest routes into a large C++ and Qt codebase.",
    criteriaField: "focus",
    criteriaLabel: "Project Area",
    detailFields: [
      { label: "Area", field: "focus" },
      { label: "Difficulty", field: "difficulty" },
    ],
  },
  IGALIA: {
    title: "Igalia Coding Experience Teams",
    desc: "A paid, part-time grant where students work alongside Igalia engineers on browsers, graphics drivers, multimedia frameworks, and language runtimes. Terms typically run several months at reduced hours.",
    criteriaField: "focus",
    criteriaLabel: "Team",
    detailFields: [
      { label: "Team", field: "focus" },
      { label: "Difficulty", field: "difficulty" },
    ],
  },
};

// ─── Child Cards (React.memo) ────────────────────────────────

export const OrgCard = React.memo(function OrgCard({
  org,
  programType,
}: {
  org: Org;
  programType: ProgramType;
}) {
  const detailFields = PROGRAM_CONFIG[programType].detailFields.filter((d) => org[d.field]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-white/10 rounded-md p-6 shadow-xs hover:shadow-md transition-all justify-between space-y-4">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {/* Company avatar: first-letter in a neutral box */}
          <div className="w-10 h-10 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-extrabold text-lg flex items-center justify-center rounded-md border border-stone-200 dark:border-white/5 shrink-0">
            {org.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-50 truncate">
              {org.name}
            </h3>
            <span className="text-xs font-mono text-stone-400 font-bold block">
              {org.timeline}
            </span>
          </div>
        </div>

        <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed line-clamp-3">
          {org.description}
        </p>

        {/* Tech stack tags - rounded-md stone pills */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {org.techStack.map((tech) => (
            <span
              key={tech}
              className="px-2 py-0.5 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 text-xs font-mono uppercase tracking-wider rounded-md font-semibold"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-3 pt-2">
        {/* Program-specific timelines & criteria */}
        {programType === "OUTREACHY" && org.mandatoryContributionPeriod && (
          <div className="p-2.5 bg-lime-500/10 dark:bg-lime-950/20 text-lime-700 dark:text-lime-400 border border-lime-500/25 rounded-md">
            <span className="text-xs font-mono uppercase font-bold tracking-widest block">
              Mandatory Contribution Period
            </span>
            <span className="text-xs font-semibold mt-0.5 block">
              {org.mandatoryContributionPeriod}
            </span>
          </div>
        )}

        {/* Program-specific stat blocks, driven by PROGRAM_CONFIG */}
        {detailFields.length === 1 && (
          <div className="p-2.5 bg-stone-50 dark:bg-stone-950 rounded-md border border-stone-200/50 dark:border-white/5 flex items-center justify-between text-xs font-mono">
            <span className="text-stone-400 uppercase">{detailFields[0].label}</span>
            <span className="text-stone-700 dark:text-stone-300 font-bold">
              {org[detailFields[0].field]}
            </span>
          </div>
        )}

        {detailFields.length > 1 && (
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            {detailFields.map((detail) => (
              <div
                key={detail.field}
                className="p-2 bg-stone-50 dark:bg-stone-950 rounded-md border border-stone-200/50 dark:border-white/5"
              >
                <span className="text-stone-400 block uppercase">{detail.label}</span>
                <span className="text-stone-700 dark:text-stone-300 font-bold mt-0.5 block truncate">
                  {org[detail.field]}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Button: rounded-md */}
        <Button asChild size="md" variant="secondary" className="w-full justify-center rounded-md">
          <a href={org.url} target="_blank" rel="noopener noreferrer">
            Visit Program <ExternalLink className="w-3.5 h-3.5 ml-2" />
          </a>
        </Button>
      </div>
    </div>
  );
});

// ─── Main Component ──────────────────────────────────────────

export default function OrgBrowserPage({ programType }: OrgBrowserPageProps) {
  const meta = PROGRAM_CONFIG[programType];
  const orgs = MOCK_ORGS[programType];

  // States
  const [search, setSearch] = useState("");
  const [selectedTech, setSelectedTech] = useState("ALL");
  const [criteriaFilter, setCriteriaFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);

  // Constants
  const itemsPerPage = 6;

  // Extract unique tech tags from organizations list
  const techOptions = useMemo(() => {
    const list = new Set<string>();
    orgs.forEach((o) => o.techStack.forEach((t) => list.add(t)));
    return Array.from(list).sort();
  }, [orgs]);

  // Extract program specific dropdown options
  const criteriaOptions = useMemo(() => {
    const list = new Set<string>();
    orgs.forEach((o) => {
      const value = o[meta.criteriaField];
      if (value) list.add(value);
    });
    return Array.from(list).sort();
  }, [orgs, meta.criteriaField]);

  // Filter logic
  const filteredOrgs = useMemo(() => {
    return orgs.filter((org) => {
      const matchesSearch =
        org.name.toLowerCase().includes(search.toLowerCase()) ||
        org.description.toLowerCase().includes(search.toLowerCase());

      const matchesTech =
        selectedTech === "ALL" || org.techStack.includes(selectedTech);

      const matchesCriteria =
        criteriaFilter === "ALL" || org[meta.criteriaField] === criteriaFilter;

      return matchesSearch && matchesTech && matchesCriteria;
    });
  }, [orgs, search, selectedTech, criteriaFilter, meta.criteriaField]);

  // Pagination logic
  const totalPages = Math.ceil(filteredOrgs.length / itemsPerPage) || 1;
  const paginatedOrgs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredOrgs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredOrgs, currentPage]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  return (
    <div className="bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-50 min-h-screen pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-6 space-y-6">
        
        {/* Back Link / Navigation */}
        <div className="flex items-center">
          <Link
            to="/student/opensource/programs"
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-50 transition-colors no-underline"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to Programs
          </Link>
        </div>

        {/* Dynamic Header Block (Premium Stone) */}
        <div className={`p-8 border border-stone-200 dark:border-white/10 ${BANNER_BG} rounded-md text-white shadow-xs`}>
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-lime-400">
              <span className="h-1.5 w-1.5 bg-lime-400 rounded-md shrink-0" />
              Open Source Initiative
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white mt-2">
              {meta.title}
            </h1>
            <p className="text-sm text-stone-300 dark:text-stone-400 max-w-3xl leading-relaxed mt-2">
              {meta.desc}
            </p>
          </div>
        </div>

        {/* Control & Filter Bar (rounded-md strict) */}
        <div className="flex flex-col md:flex-row gap-4 bg-white dark:bg-stone-900 p-4 border border-stone-200 dark:border-white/10 rounded-md shadow-xs">
          
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 dark:text-stone-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search organizations or projects..."
              className="w-full pl-9 pr-4 py-2 border border-stone-200 dark:border-white/10 rounded-md text-stone-900 dark:text-stone-50 placeholder-stone-400 dark:placeholder-stone-500 text-sm bg-stone-50 dark:bg-stone-950 focus:outline-none focus:border-stone-400 dark:focus:border-white/20 transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Tech Stack Dropdown */}
            <EditorialDropdown
              icon={<Code2 className="w-3.5 h-3.5" />}
              label="Tech Stack"
              value={selectedTech}
              onChange={(v) => {
                setSelectedTech(v);
                setCurrentPage(1);
              }}
              options={[
                { value: "ALL", label: "All Languages" },
                ...techOptions.map((opt) => ({ value: opt, label: opt })),
              ]}
            />

            {/* Program Specific Dropdown */}
            <EditorialDropdown
              icon={<Filter className="w-3.5 h-3.5" />}
              label={meta.criteriaLabel}
              value={criteriaFilter}
              onChange={(v) => {
                setCriteriaFilter(v);
                setCurrentPage(1);
              }}
              options={[
                { value: "ALL", label: "All Options" },
                ...criteriaOptions.map((opt) => ({ value: opt, label: opt })),
              ]}
            />
          </div>

        </div>

        {/* Organization Discovery Grid (gap-6 responsive) */}
        {filteredOrgs.length === 0 ? (
          <EmptyState
            icon={<Filter className="w-5 h-5 text-stone-400 dark:text-stone-500" />}
            title="No participating organizations found matching your search."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedOrgs.map((org) => (
              <OrgCard key={org.id} org={org} programType={programType} />
            ))}
          </div>
        )}

        {/* Pagination Controls (Bottom) */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1.5 pt-6">
            {/* Previous page */}
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage === 1}
              onClick={() => handlePageChange(currentPage - 1)}
              aria-label="Go to previous page"
              className="rounded-md h-8 px-2 border-stone-200 dark:border-white/10 hover:bg-stone-100 dark:hover:bg-white/5"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            {/* Page indices */}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
              const active = currentPage === page;
              return (
                <Button
                  key={page}
                  size="sm"
                  variant={active ? "primary" : "outline"}
                  onClick={() => handlePageChange(page)}
                  aria-label={`Go to page ${page}`}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md h-8 w-8 min-w-0 p-0 ${
                    active
                      ? "bg-lime-500 text-stone-950 font-bold border-none"
                      : "border-stone-200 dark:border-white/10 hover:bg-stone-100 dark:hover:bg-white/5 text-stone-700 dark:text-stone-300"
                  }`}
                >
                  {page}
                </Button>
              );
            })}

            {/* Next page */}
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage === totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
              aria-label="Go to next page"
              className="rounded-md h-8 px-2 border-stone-200 dark:border-white/10 hover:bg-stone-100 dark:hover:bg-white/5"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        </div>
    </div>
  );
}