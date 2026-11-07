"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCategories } from "@/features/tickets/hooks";
import type { Article } from "@/types/api";

export interface ArticleDraft {
  title: string; category_id: number | null; problem_description: string; steps: string[]; escalation: string | null;
  tags: string[]; source_note: string;
}

export function ArticleForm({ initial, busy, error, submitLabel, onSubmit, onCancel }: {
  initial?: Article; busy: boolean; error: string | null; submitLabel: string;
  onSubmit: (v: ArticleDraft) => void; onCancel?: () => void;
}) {
  const cats = useCategories();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [cat, setCat] = useState(initial?.category?.id ? String(initial.category.id) : "");
  const [problem, setProblem] = useState(initial?.problem_description ?? "");
  const [steps, setSteps] = useState((initial?.steps ?? []).join("\n"));
  const [esc, setEsc] = useState(initial?.escalation ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [note, setNote] = useState(initial?.source_note ?? "");
  const stepList = steps.split("\n").map((s) => s.trim()).filter(Boolean);
  const valid = title.trim() && problem.trim() && stepList.length > 0 && note.trim();

  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      onSubmit({ title, category_id: cat ? Number(cat) : null, problem_description: problem, steps: stepList,
        escalation: esc.trim() || null, tags: tags.split(",").map((t) => t.trim()).filter(Boolean), source_note: note });
    }}>
      <label className="block text-sm">Title<Input className="mt-1" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} required /></label>
      <label className="block text-sm">Category
        <Select className="mt-1" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">No category</option>
          {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select></label>
      <label className="block text-sm">Problem description
        <Textarea className="mt-1" rows={3} maxLength={5000} value={problem} onChange={(e) => setProblem(e.target.value)} required /></label>
      <label className="block text-sm">Troubleshooting steps <span className="text-muted">(one per line)</span>
        <Textarea className="mt-1" rows={6} value={steps} onChange={(e) => setSteps(e.target.value)} required /></label>
      <label className="block text-sm">When to escalate <span className="text-muted">(optional)</span>
        <Textarea className="mt-1" rows={2} maxLength={2000} value={esc} onChange={(e) => setEsc(e.target.value)} /></label>
      <label className="block text-sm">Tags <span className="text-muted">(comma separated)</span>
        <Input className="mt-1" value={tags} onChange={(e) => setTags(e.target.value)} /></label>
      <label className="block text-sm">Source note <span className="text-muted">(where this guidance comes from)</span>
        <Textarea className="mt-1" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} required /></label>
      <p className="text-xs text-muted">Plain text only; HTML tags are removed. Saved changes need administrator approval before they are used for suggestions.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !valid}>{busy ? "Saving…" : submitLabel}</Button>
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}
