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

function Field({ id, label, hint, required, children }: { id: string; label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 flex items-baseline justify-between gap-2 text-sm font-medium">
        <span>{label}{required && <span aria-hidden className="text-danger"> *</span>}</span>
        {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
      </label>
      {children}
    </div>
  );
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
  const missing = [!title.trim() && "title", !problem.trim() && "problem description", stepList.length === 0 && "at least one step", !note.trim() && "source note"].filter(Boolean);

  return (
    <form aria-label="Article" className="space-y-5 rounded-lg border border-line bg-panel p-5 shadow-sm sm:p-6" onSubmit={(e) => {
      e.preventDefault();
      onSubmit({ title, category_id: cat ? Number(cat) : null, problem_description: problem, steps: stepList,
        escalation: esc.trim() || null, tags: tags.split(",").map((t) => t.trim()).filter(Boolean), source_note: note });
    }}>
      <div className="grid gap-5 sm:grid-cols-[1fr_16rem]">
        <Field id="a-title" label="Title" required><Input id="a-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} required /></Field>
        <Field id="a-cat" label="Category">
          <Select id="a-cat" className="w-full" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">No category</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field id="a-problem" label="Problem description" required>
        <Textarea id="a-problem" rows={3} maxLength={5000} value={problem} onChange={(e) => setProblem(e.target.value)} required />
      </Field>
      <Field id="a-steps" label="Troubleshooting steps" hint={`One per line · ${stepList.length} step${stepList.length === 1 ? "" : "s"}`} required>
        <Textarea id="a-steps" rows={7} value={steps} onChange={(e) => setSteps(e.target.value)} required />
      </Field>
      <Field id="a-esc" label="When to escalate" hint="Optional">
        <Textarea id="a-esc" rows={2} maxLength={2000} value={esc} onChange={(e) => setEsc(e.target.value)} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="a-tags" label="Tags" hint="Comma separated"><Input id="a-tags" value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
        <Field id="a-note" label="Source note" hint="Where this guidance comes from" required>
          <Input id="a-note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} required />
        </Field>
      </div>
      <p className="text-xs text-muted">Plain text only; HTML tags are removed. Saved changes need administrator approval before they are used for suggestions.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {missing.length > 0 && <p className="mr-auto text-xs text-muted">Still needed: {missing.join(", ")}.</p>}
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={busy || missing.length > 0}>{busy ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
