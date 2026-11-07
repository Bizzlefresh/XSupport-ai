"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { ArticleForm, type ArticleDraft } from "@/features/knowledge/ArticleForm";
import { api } from "@/lib/api";
import type { Article } from "@/types/api";

export default function NewArticlePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (v: ArticleDraft) => api<Article>("/knowledge", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: (a) => { qc.invalidateQueries({ queryKey: ["articles"] }); router.push(`/knowledge/${a.id}`); },
  });
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">New article</h1>
      <p className="text-sm text-muted">New articles are saved as drafts. An administrator approves them before they appear in suggestions.</p>
      <ArticleForm busy={create.isPending} error={create.error ? (create.error as Error).message : null}
        submitLabel="Save draft" onSubmit={(v) => create.mutate(v)} />
    </div>
  );
}
