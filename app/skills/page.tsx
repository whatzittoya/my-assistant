import Link from "next/link";
import { listSkills } from "@/lib/skills";
import { SkillsManager } from "./skills-manager";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const skills = await listSkills();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Skills</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          System prompts that control how Gemini behaves when generating replies.
        </p>
      </div>
      <SkillsManager initialSkills={skills} />
    </div>
  );
}
