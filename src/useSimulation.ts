import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Project, Result } from "./types";
import { queuedSolve } from "./solveQueue";

export function useSimulation(
  project: Project,
  ready: boolean,
  revision: number,
) {
  // Labels do not affect physics. Changing them should not enqueue another solve.
  const key = JSON.stringify({
    ...project,
    name: "",
    description: "",
    layers: project.layers.map((l) => ({ ...l, name: "" })),
  });
  const input = useMemo(() => JSON.parse(key) as Project, [key]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [output, setOutput] = useState<{
    result: Result;
    project: Project;
    key: string;
    revision: number;
  } | null>(null);
  const [status, setStatus] = useState("Initializing…");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setStatus("Input changed · solve pending");
    setError("");
    const timer = window.setTimeout(() => {
      // A running solve finishes first. Superseded requests never enter the core.
      queue.current = queue.current.then(async () => {
        if (cancelled) return;
        try {
          const fixed = input.layers.every(
            (l) => l.charge_mode === "fixed_volume",
          );
          for (const quality of fixed
            ? (["full"] as const)
            : (["preview", "full"] as const)) {
            if (cancelled) return;
            setStatus(
              quality === "preview"
                ? "Solving preview…"
                : "Solving full model…",
            );
            const result = await queuedSolve(input, quality, () => cancelled);
            if (cancelled) return;
            setOutput({ result, project: input, key, revision });
            setStatus(
              quality === "preview"
                ? "Preview · refining…"
                : result.convergence.converged
                  ? "Converged"
                  : "Not converged",
            );
          }
        } catch (e) {
          if (!cancelled) {
            setError(String(e));
            setStatus("Solve failed");
          }
        }
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input, key, ready, revision]);
  const stale =
    !!output && (output.key !== key || output.revision !== revision);
  return {
    result: output?.result ?? null,
    resultProject: output?.project ?? project,
    status,
    solveError: error,
    stale,
    exportReady:
      !!output &&
      !stale &&
      !error &&
      output.result.convergence.converged &&
      output.result.convergence.quality === "full",
  };
}
