import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DerivedTask, Metrics, Task } from '@/types';
import {
  computeAverageROI,
  computePerformanceGrade,
  computeRevenuePerHour,
  computeTimeEfficiency,
  computeTotalRevenue,
  withDerived,
  sortTasks as sortDerived,
} from '@/utils/logic';
// Local storage removed per request; keep everything in memory
import { generateSalesTasks } from '@/utils/seed';

interface UseTasksState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  derivedSorted: DerivedTask[];
  metrics: Metrics;
  lastDeleted: Task | null;
  addTask: (task: Omit<Task, 'id'> & { id?: string }) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  undoDelete: () => void;
  clearLastDeleted: () => void; // <-- added
}

const INITIAL_METRICS: Metrics = {
  totalRevenue: 0,
  totalTimeTaken: 0,
  timeEfficiencyPct: 0,
  revenuePerHour: 0,
  averageROI: 0,
  performanceGrade: 'Needs Improvement',
};

export function useTasks(): UseTasksState {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastDeleted, setLastDeleted] = useState<Task | null>(null);

  // guard so we don't load twice in dev (StrictMode) or fast remounts
  const fetchedRef = useRef(false);

  function clearLastDeleted() {
    setLastDeleted(null);
  }

  function normalizeTasks(input: any[]): Task[] {
    const now = Date.now();
    const arr = Array.isArray(input) ? input : [];
    const mapped = arr.map((t, idx) => {
      const created = t?.createdAt ? new Date(t.createdAt) : new Date(now - (idx + 1) * 24 * 3600 * 1000);
      const completed =
        t?.completedAt || (t?.status === 'Done' ? new Date(created.getTime() + 24 * 3600 * 1000).toISOString() : undefined);

      const id = t?.id ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? (crypto as any).randomUUID() : `id-${Date.now()}-${idx}`);
      const title = (typeof t?.title === 'string' && t.title.trim().length > 0) ? t.title.trim() : 'Untitled Task';
      const revenue = Number.isFinite(Number(t?.revenue)) ? Number(t.revenue) : 0;
      const timeTaken = Number(t?.timeTaken) > 0 ? Number(t.timeTaken) : 1;
      const priority = t?.priority ?? 'Low';
      const status = t?.status ?? 'Todo';
      const notes = t?.notes ?? '';

      return {
        id,
        title,
        revenue,
        timeTaken,
        priority,
        status,
        notes,
        createdAt: created.toISOString(),
        completedAt: completed,
      } as Task;
    });

    // filter out obviously malformed rows (no title or non-numeric revenue)
    const filtered = mapped.filter(t => !!t.title && Number.isFinite(Number(t.revenue)));

    // deduplicate by id, keeping first occurrence
    const seen = new Set<string>();
    const unique: Task[] = [];
    for (const t of filtered) {
      if (!t.id) continue;
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      unique.push(t);
    }

    return unique;
  }

  // Initial load: public JSON -> fallback generated dummy
  useEffect(() => {
    if (fetchedRef.current) {
      setLoading(false);
      return;
    }
    let isMounted = true;
    async function load() {
      try {
        const res = await fetch('/tasks.json');
        let finalData: Task[] = [];
        if (!res.ok) {
          // no tasks.json or not found -> fallback to seed
          finalData = generateSalesTasks(50);
        } else {
          const data = (await res.json()) as any[];
          const normalized: Task[] = normalizeTasks(data);
          finalData = normalized.length > 0 ? normalized : generateSalesTasks(50);
        }

        if (isMounted) {
          setTasks(finalData);
          fetchedRef.current = true;
        }
      } catch (e: any) {
        if (isMounted) setError(e?.message ?? 'Failed to load tasks');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  // NOTE: intentionally removed the opportunistic second fetch (it caused duplicates)

  const derivedSorted = useMemo<DerivedTask[]>(() => {
    const withRoi = tasks.map(withDerived);
    return sortDerived(withRoi);
  }, [tasks]);

  const metrics = useMemo<Metrics>(() => {
    if (tasks.length === 0) return INITIAL_METRICS;
    const totalRevenue = computeTotalRevenue(tasks);
    const totalTimeTaken = tasks.reduce((s, t) => s + (Number.isFinite(Number(t.timeTaken)) ? Number(t.timeTaken) : 0), 0);
    const timeEfficiencyPct = computeTimeEfficiency(tasks);
    const revenuePerHour = computeRevenuePerHour(tasks);
    const averageROI = computeAverageROI(tasks);
    const performanceGrade = computePerformanceGrade(averageROI);
    return { totalRevenue, totalTimeTaken, timeEfficiencyPct, revenuePerHour, averageROI, performanceGrade };
  }, [tasks]);

  const addTask = useCallback((task: Omit<Task, 'id'> & { id?: string }) => {
    setTasks(prev => {
      // ensure unique id
      let id = task.id ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? (crypto as any).randomUUID() : `id-${Date.now()}`);
      // if id already exists, generate a fresh one
      if (prev.some(t => t.id === id)) {
        id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? (crypto as any).randomUUID() : `${id}-${Date.now()}`;
      }
      const timeTaken = (task.timeTaken ?? 0) <= 0 ? 1 : task.timeTaken!;
      const createdAt = new Date().toISOString();
      const status = task.status ?? 'Todo';
      const completedAt = status === 'Done' ? createdAt : undefined;
      const newTask: Task = { ...task, id, timeTaken, createdAt, completedAt } as Task;
      return [...prev, newTask];
    });
  }, []);

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks(prev => {
      const next = prev.map(t => {
        if (t.id !== id) return t;
        const merged = { ...t, ...patch } as Task;
        if (t.status !== 'Done' && merged.status === 'Done' && !merged.completedAt) {
          merged.completedAt = new Date().toISOString();
        }
        // ensure timeTaken > 0
        if ((merged.timeTaken ?? 0) <= 0) merged.timeTaken = 1;
        return merged;
      });
      return next;
    });
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => {
      const target = prev.find(t => t.id === id) || null;
      setLastDeleted(target);
      return prev.filter(t => t.id !== id);
    });
  }, []);

  const undoDelete = useCallback(() => {
    if (!lastDeleted) return;
    setTasks(prev => {
      // avoid duplicate id re-insert if exists
      if (prev.some(t => t.id === lastDeleted.id)) {
        // if id already exists, generate new id
        const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? (crypto as any).randomUUID() : `${lastDeleted.id}-${Date.now()}`;
        return [...prev, { ...lastDeleted, id }];
      }
      return [...prev, lastDeleted];
    });
    setLastDeleted(null);
  }, [lastDeleted]);

  return { tasks, loading, error, derivedSorted, metrics, lastDeleted, addTask, updateTask, deleteTask, undoDelete, clearLastDeleted };
}
