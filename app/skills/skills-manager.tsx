"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import type { Skill } from "@/lib/skills";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-");
}

function SkillCard({
  skill,
  onUpdate,
  onDelete,
}: {
  skill: Skill;
  onUpdate: (updated: Skill) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(skill.name);
  const [prompt, setPrompt] = useState(skill.systemPrompt);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/skills/${skill.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, systemPrompt: prompt }),
      });
      if (!res.ok) throw new Error("Failed");
      onUpdate({ ...skill, name, systemPrompt: prompt });
      toast.success("Saved");
      setOpen(false);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete skill "${skill.name}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/skills/${skill.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      onDelete(skill.id);
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  const preview = skill.systemPrompt.split("\n")[0].slice(0, 140);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{skill.name}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground font-mono">{skill.id}</p>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
              {open ? "Close" : "Edit"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={remove}
              disabled={deleting}
            >
              {deleting ? "..." : "Delete"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!open && (
          <p className="text-sm text-muted-foreground line-clamp-2">{preview}</p>
        )}
        {open && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">System prompt</label>
              <Textarea
                value={prompt}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
                rows={8}
                className="mt-1 text-sm font-mono"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setName(skill.name);
                  setPrompt(skill.systemPrompt);
                  setOpen(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SkillsManager({ initialSkills }: { initialSkills: Skill[] }) {
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    const id = slugify(newName);
    if (!id) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: newName, systemPrompt: newPrompt }),
      });
      if (!res.ok) throw new Error("Failed");
      const newSkill: Skill = {
        id,
        name: newName,
        systemPrompt: newPrompt,
        updatedAt: new Date().toISOString(),
      };
      setSkills((prev) => [...prev, newSkill].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setNewPrompt("");
      setCreating(false);
      toast.success("Skill created");
    } catch {
      toast.error("Failed to create");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating((v) => !v)} variant={creating ? "outline" : "default"}>
          {creating ? "Cancel" : "New skill"}
        </Button>
      </div>

      {creating && (
        <Card className="border-dashed">
          <CardContent className="pt-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={newName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
                placeholder="e.g. Forum Perkenalan"
                className="mt-1"
              />
              {newName && (
                <p className="mt-0.5 text-xs text-muted-foreground font-mono">
                  ID: {slugify(newName)}
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">System prompt</label>
              <Textarea
                value={newPrompt}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewPrompt(e.target.value)}
                rows={6}
                className="mt-1 text-sm font-mono"
                placeholder="You are a helpful lecturer at Universitas Terbuka..."
              />
            </div>
            <Button size="sm" onClick={create} disabled={saving || !newName}>
              {saving ? "Creating..." : "Create"}
            </Button>
          </CardContent>
        </Card>
      )}

      {skills.length === 0 && !creating && (
        <p className="text-sm text-muted-foreground">No skills yet. Create one to get started.</p>
      )}

      <div className="space-y-3">
        {skills.map((s) => (
          <SkillCard
            key={s.id}
            skill={s}
            onUpdate={(updated) =>
              setSkills((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
            }
            onDelete={(id) => setSkills((prev) => prev.filter((x) => x.id !== id))}
          />
        ))}
      </div>
    </div>
  );
}
