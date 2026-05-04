"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Skill } from "@/lib/skills";

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
}

export function SkillManager({
  skills,
  selectedId,
  onSelect,
  onSkillsChange,
}: {
  skills: Skill[];
  selectedId: string;
  onSelect: (id: string) => void;
  onSkillsChange: (skills: Skill[]) => void;
}) {
  const [mode, setMode] = useState<"idle" | "edit" | "new">("idle");
  const [editPrompt, setEditPrompt] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const selected = skills.find((s) => s.id === selectedId);

  function openEdit() { setEditPrompt(selected?.systemPrompt ?? ""); setMode("edit"); }

  async function saveEdit() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/skills/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selected.name, systemPrompt: editPrompt }),
      });
      if (!res.ok) throw new Error("Failed");
      onSkillsChange(skills.map((s) => s.id === selected.id ? { ...s, systemPrompt: editPrompt } : s));
      setMode("idle");
      toast.success("Skill updated");
    } catch { toast.error("Failed to save"); } finally { setSaving(false); }
  }

  async function createSkill() {
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
      const created: Skill = { id, name: newName, systemPrompt: newPrompt, updatedAt: new Date().toISOString() };
      const updated = [...skills, created].sort((a, b) => a.name.localeCompare(b.name));
      onSkillsChange(updated);
      onSelect(id);
      setNewName(""); setNewPrompt(""); setMode("idle");
      toast.success("Skill created");
    } catch { toast.error("Failed to create"); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground">Skill</label>
      <div className="flex flex-wrap items-center gap-2">
        {skills.length === 0 ? (
          <span className="text-sm text-muted-foreground">No skills yet</span>
        ) : (
          <select
            value={selectedId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { onSelect(e.target.value); setMode("idle"); }}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            {skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {selected && mode === "idle" && <Button size="sm" variant="outline" onClick={openEdit}>Edit</Button>}
        {mode !== "new" && <Button size="sm" variant="outline" onClick={() => setMode("new")}>+ New skill</Button>}
        {mode !== "idle" && <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>Cancel</Button>}
      </div>
      {mode === "edit" && selected && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">Editing: {selected.name}</p>
          <Textarea value={editPrompt} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditPrompt(e.target.value)} rows={5} className="text-sm font-mono" />
          <Button size="sm" onClick={saveEdit} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </div>
      )}
      {mode === "new" && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <Input value={newName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)} placeholder="Skill name" className="text-sm" />
          {newName && <p className="text-xs text-muted-foreground font-mono">ID: {slugify(newName)}</p>}
          <Textarea value={newPrompt} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewPrompt(e.target.value)} rows={5} className="text-sm font-mono" placeholder="System prompt for Gemini..." />
          <Button size="sm" onClick={createSkill} disabled={saving || !newName}>{saving ? "Creating..." : "Create"}</Button>
        </div>
      )}
    </div>
  );
}
