"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ArticleForm, type ArticleDraft } from "@/features/knowledge/ArticleForm";
import { api } from "@/lib/api";
import type { Article } from "@/types/api";

export default function NewArticlePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const create = useMutation({
    mutationFn: (v: ArticleDraft) => api<Article>("/knowledge", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["articles"] });
      toast({ kind: "success", title: "Draft saved", detail: "An administrator approves it before it is used for suggestions." });
      router.push(`/knowledge/${a.id}`);
    },
  });
  return (
    <div className="max-w-3xl">
      <Link href="/knowledge" className="inline-flex items-center gap-1 rounded text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden className="h-4 w-4" />Knowledge base
      </Link>
      <div className="mt-3"><PageHeader title="New article" description="New articles are saved as drafts. An administrator approves them before they appear in suggestions." /></div>
      <ArticleForm busy={create.isPending} error={create.error ? (create.error as Error).message : null}
        submitLabel="Save draft" onSubmit={(v) => create.mutate(v)} />
    </div>
  );
}
