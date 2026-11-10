"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/primitives";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAssignees, useCategories } from "@/features/tickets/hooks";
import { api } from "@/lib/api";
import { PRIORITIES, label } from "@/lib/format";
import type { TicketDetail } from "@/types/api";

export default function NewTicketPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const cats = useCategories();
  const people = useAssignees();
  const [f, setF] = useState({ subject: "", description: "", category_id: "", priority: "medium", assignee_id: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const create = useMutation({
    mutationFn: () => api<TicketDetail>("/tickets", {
      method: "POST",
      body: JSON.stringify({
        subject: f.subject, description: f.description, priority: f.priority,
        category_id: f.category_id ? Number(f.category_id) : null,
        assignee_id: f.assignee_id ? Number(f.assignee_id) : null,
      }),
    }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      router.push(`/tickets/${t.id}`);
    },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate(); };

  return (
    <div className="max-w-3xl">
    <Link href="/tickets" className="inline-flex items-center gap-1 rounded text-sm text-muted hover:text-ink">
      <ArrowLeft aria-hidden className="h-4 w-4" />Tickets
    </Link>
    <div className="mt-3"><PageHeader title="New ticket" description="Category and priority are optional here; a technician can set them later, and AI category suggestions are offered on the ticket page." /></div>
    <form onSubmit={submit} aria-label="New ticket" className="space-y-5 rounded-lg border border-line bg-panel p-5 shadow-sm sm:p-6">
      <div><label htmlFor="subject" className="mb-1 block text-sm font-medium">Subject</label>
        <Input id="subject" required maxLength={300} value={f.subject} onChange={set("subject")} /></div>
      <div><label htmlFor="desc" className="mb-1 block text-sm font-medium">Description</label>
        <Textarea id="desc" required rows={7} maxLength={10000} value={f.description} onChange={set("description")} /></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label htmlFor="cat" className="mb-1 block text-sm font-medium">Category</label>
          <Select id="cat" className="w-full" value={f.category_id} onChange={set("category_id")}>
            <option value="">Not set</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
        <div><label htmlFor="pri" className="mb-1 block text-sm font-medium">Priority</label>
          <Select id="pri" className="w-full" value={f.priority} onChange={set("priority")}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</Select></div>
        <div><label htmlFor="asg" className="mb-1 block text-sm font-medium">Assignee</label>
          <Select id="asg" className="w-full" value={f.assignee_id} onChange={set("assignee_id")}>
            <option value="">Unassigned</option>{people.data?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select></div>
      </div>
      {create.isError && <p role="alert" className="text-sm text-danger">{(create.error as Error).message}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={create.isPending || !f.subject.trim() || !f.description.trim()}>
          {create.isPending ? "Creating…" : "Create ticket"}</Button>
        <Button type="button" variant="secondary" onClick={() => router.push("/tickets")}>Cancel</Button>
      </div>
    </form>
    </div>
  );
}
