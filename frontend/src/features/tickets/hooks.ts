import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Category, Person } from "@/types/api";

export const useCategories = () =>
  useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories"), staleTime: 300_000 });

export const useAssignees = () =>
  useQuery({ queryKey: ["assignees"], queryFn: () => api<Person[]>("/assignees"), staleTime: 300_000 });
