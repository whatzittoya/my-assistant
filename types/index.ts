export type Credential = {
  id: string;
  label: string;
  username: string;
  createdAt: string;
  updatedAt: string;
};

export type CredentialWithSecret = Credential & {
  password: string;
};

export type Course = {
  courseId: string;
  name: string;
  url: string;
  forumPerkenalan?: string; // URL to Forum Perkenalan mod
  collectedAt: string;
};

export type Discussion = {
  id: string; // ?d= param
  title: string;
  url: string;
  startedBy: string;
  lastPostBy: string;
  lastPostDate: string; // ISO from datetime attr
  repliesCount: number;
  iReplied: boolean;
  collectedAt: string;
};

export type SessionActivity = {
  name: string;
  url: string;
};

export type Session = {
  id: string;        // section number from URL e.g. "1" or "1-2" for subtabs
  name: string;      // "Sesi 1" or "Sesi 2 - Aktivitas Belajar 2"
  url: string;
  diskusi: SessionActivity[];
  tugas: SessionActivity[];
  collectedAt: string;
};

export type PedomanItem = {
  id: string;
  criteria: string;
  maxScore: number;
};

export type TugasMeta = {
  description: string;
  pedomanItems: PedomanItem[];
  updatedAt: string | null;
};

export type DiskusiMeta = {
  question: string;
  pedomanItems: PedomanItem[];
  updatedAt: string | null;
};

export type CriteriaScore = {
  id: string;
  criteria: string;
  score: number;
  maxScore: number;
};

export type SubmissionAiEval = {
  criteriaScores: CriteriaScore[];
  totalScore: number;
  reasoning: string;
  feedback: string;
  generatedAt: string;
};

export type SubmissionFinalEval = {
  criteriaScores: CriteriaScore[];
  totalScore: number;
  feedback: string;
  savedAt: string;
};

export type TugasFile = {
  filename: string;
  url: string;
  submittedAt: string;
  localPath: string | null; // relative to .tugas-files/
};

export type TugasSubmission = {
  userId: string;
  name: string;
  email: string;
  status: string;
  grade: string | null;
  lastModifiedSubmission: string;
  lastModifiedGrade: string | null;
  feedbackComment: string;
  finalGrade: number | null;
  files: TugasFile[];
  collectedAt: string;
  aiEval?: SubmissionAiEval;
  finalEval?: SubmissionFinalEval;
};

export type Post = {
  postId: string;
  subject: string;
  author: string;
  authorUrl: string;
  datetimeIso: string;
  contentHtml: string;
  parentPostId: string | null;
  isMyPost: boolean; // has Split link = tutor
  depth: number;
  rating: number | null;      // aggregate rating score (e.g. 80)
  ratingCount: number | null; // number of raters
  iRepliedToThis: boolean;    // lecturer has a child reply under this post
};

export type GradebookItemKind = "diskusi" | "tugas";

export type GradebookItem = {
  itemId: string;
  kind: GradebookItemKind;
  name: string;
  url: string;
  activityId: string;
};

export type GradebookStudentGrade = {
  itemId: string;
  value: string | null;
  feedback: string | null;
};

export type GradebookStudent = {
  uid: string;
  name: string;
  email: string;
  studentNo: string | null;
  grades: GradebookStudentGrade[];
};

export type GradebookSnapshot = {
  courseId: string;
  sourceUrl: string;
  items: GradebookItem[];
  students: GradebookStudent[];
  collectedAt: string;
};

export type ScoreMonitorEvidence = {
  exists: boolean;
  source: "diskusi" | "tugas";
  userId: string | null;
  studentNo: string | null;
  title: string;
  url: string;
  detail: string;
  hasTutorReply?: boolean;
};

export type ScoreMonitorRow = {
  item: GradebookItem;
  student: GradebookStudent;
  lmsGrade: string | null;
  feedback: string | null;
  evidence: ScoreMonitorEvidence | null;
  missingScore: boolean;
};

export type ScoreMonitorSummary = {
  totalRows: number;
  missingScores: number;
  missingDiskusi: number;
  missingTugas: number;
};
