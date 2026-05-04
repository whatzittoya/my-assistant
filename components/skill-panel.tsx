"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { Skill } from "@/lib/skills";

export function SkillPanel({ skillId }: { skillId: string }) {
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/skills/${skillId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setSkill(data);
          setDraft(data.systemPrompt);
        }
      })
      .finally(() => setLoading(false));
  }, [skillId]);

  async function save() {
    setSaving(true);
    try {
      const name = skill?.name ?? skillId;
      const res = await fetch(`/api/skills/${skillId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, systemPrompt: draft }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSkill((prev) => prev ? { ...prev, systemPrompt: draft } : prev);
      toast.success("Skill saved");
      setOpen(false);
    } catch {
      toast.error("Failed to save skill");
    } finally {
      setSaving(false);
    }
  }

  async function createDefault() {
    setSaving(true);
    try {
      const res = await fetch(`/api/skills/${skillId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Forum Perkenalan",
          systemPrompt:
            "Kamu adalah dosen Universitas Terbuka yang membalas kiriman mahasiswa di Forum Perkenalan dengan ramah, singkat, dan profesional dalam Bahasa Indonesia. Sambut mahasiswa, komentari satu hal menarik dari perkenalannya, dan dorong semangat belajar mereka.",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const defaultSkill: Skill = {
        id: skillId,
        name: "Forum Perkenalan",
        systemPrompt:
          "Kamu adalah dosen Universitas Terbuka yang membalas kiriman mahasiswa di Forum Perkenalan dengan ramah, singkat, dan profesional dalam Bahasa Indonesia. Sambut mahasiswa, komentari satu hal menarik dari perkenalannya, dan dorong semangat belajar mereka.",
        updatedAt: new Date().toISOString(),
      };
      setSkill(defaultSkill);
      setDraft(defaultSkill.systemPrompt);
      setOpen(true);
      toast.success("Default skill created — edit to customise");
    } catch {
      toast.error("Failed to create skill");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  if (!skill) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground flex items-center justify-between">
        <span>No skill configured for this forum.</span>
        <Button size="sm" variant="outline" onClick={createDefault} disabled={saving}>
          {saving ? "Creating..." : "Create default"}
        </Button>
      </div>
    );
  }

  const preview = skill.systemPrompt.split("\n")[0].slice(0, 120);

  return (
    <div className="rounded-lg border">
      {/* Header row */}
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) setDraft(skill.systemPrompt);
        }}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent/50"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Skill
          </span>
          <Badge variant="outline" className="text-xs">
            {skill.name}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>

      {!open && (
        <p className="px-4 pb-3 text-xs text-muted-foreground line-clamp-1">{preview}</p>
      )}

      {open && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3">
          <Textarea
            value={draft}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
            rows={6}
            className="text-sm font-mono"
            placeholder="Write the system prompt that tells Gemini how to behave..."
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(skill.systemPrompt);
                setOpen(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
