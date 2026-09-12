import { invoke } from "@tauri-apps/api/core";
import type { Project, Result } from "./types";
// One queue shared by interactive solves, studies, and mesh checks.
let queue: Promise<unknown> = Promise.resolve();
export function queuedSolve(
  project: Project,
  quality: "full" | "preview",
  cancelled = () => false,
): Promise<Result> {
  const next = queue
    .catch(() => {})
    .then(() => {
      if (cancelled()) throw Error("Cancelled");
      return invoke<Result>("run_simulation", { project, quality });
    });
  queue = next;
  return next;
}
