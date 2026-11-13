import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../auth/AuthContext';
import { useOfflineSync } from '../offline/OfflineSync';
import type { OutboxItem } from '../offline/outbox';

export type WeightPoint = { day: string; weight_kg: number };
export type WaterDay = { day: string; ml: number };

const WEIGHTS = '/fitness/weights';
const WATER = '/fitness/water';
const cacheKey = (userId: number) => `bjjbuddy.fitness.v1.${userId}`;
const goalsKey = (userId: number) => `bjjbuddy.fitness.goals.v1.${userId}`;

export type FitnessGoals = { waterMl: number; targetKg: number | null };
const DEFAULT_GOALS: FitnessGoals = { waterMl: 2500, targetKg: null };

/** Server data with this phone's not-yet-uploaded changes applied on top. */
function applyPending(weights: WeightPoint[], water: WaterDay[], pending: OutboxItem[]) {
  let w = weights;
  let d = water;
  for (const item of pending) {
    if (item.path.startsWith(`${WEIGHTS}/`)) {
      const day = item.path.slice(WEIGHTS.length + 1);
      w = w.filter((x) => x.day !== day);
      if (item.method === 'PUT') w = [...w, { day, weight_kg: (item.body as { weight_kg: number }).weight_kg }];
    } else if (item.path.startsWith(`${WATER}/`)) {
      const day = item.path.slice(WATER.length + 1);
      d = [...d.filter((x) => x.day !== day), { day, ml: (item.body as { ml: number }).ml }];
    }
  }
  const byDay = <T extends { day: string }>(a: T, b: T) => a.day.localeCompare(b.day);
  return { weights: [...w].sort(byDay), water: d.filter((x) => x.ml > 0).sort(byDay) };
}

/**
 * Weight log and daily water, saved on the phone first and uploaded when there's signal.
 * Weights and water are oldest first.
 */
export function useFitness() {
  const { user, request } = useAuth();
  const { pending, queue, onUploaded } = useOfflineSync();
  const userId = user?.id ?? 0;
  const [base, setBase] = useState<{ weights: WeightPoint[]; water: WaterDay[] }>({ weights: [], water: [] });
  const [goals, setGoalsState] = useState<FitnessGoals>(DEFAULT_GOALS);
  const [ready, setReady] = useState(false);

  const save = useCallback(
    (next: { weights: WeightPoint[]; water: WaterDay[] }) => {
      setBase(next);
      AsyncStorage.setItem(cacheKey(userId), JSON.stringify(next)).catch(() => {});
    },
    [userId],
  );

  // What's saved on the phone first, then the latest from the server.
  useEffect(() => {
    let cancelled = false;
    Promise.all([AsyncStorage.getItem(cacheKey(userId)), AsyncStorage.getItem(goalsKey(userId))])
      .then(([cached, savedGoals]) => {
        if (cancelled) return;
        if (cached) setBase(JSON.parse(cached));
        if (savedGoals) setGoalsState({ ...DEFAULT_GOALS, ...JSON.parse(savedGoals) });
      })
      .catch(() => {})
      .finally(() => !cancelled && setReady(true));
    Promise.all([
      request<WeightPoint[]>(`${WEIGHTS}?days=730`, { timeoutMs: 8000 }),
      request<WaterDay[]>(`${WATER}?days=60`, { timeoutMs: 8000 }),
    ])
      .then(([weights, water]) => !cancelled && save({ weights, water }))
      .catch(() => {}); // offline: keep what's on the phone
    return () => {
      cancelled = true;
    };
  }, [userId, request, save]);

  // When a queued change uploads, fold the server's answer in.
  useEffect(
    () =>
      onUploaded((item, response) => {
        if (!item.path.startsWith('/fitness/')) return;
        setBase((prev) => {
          let next = prev;
          if (item.path.startsWith(`${WEIGHTS}/`)) {
            const day = item.path.slice(WEIGHTS.length + 1);
            const weights = prev.weights.filter((x) => x.day !== day);
            if (item.method === 'PUT' && response) weights.push(response as WeightPoint);
            next = { ...prev, weights: weights.sort((a, b) => a.day.localeCompare(b.day)) };
          } else if (item.path.startsWith(`${WATER}/`) && response) {
            const r = response as WaterDay;
            next = { ...prev, water: [...prev.water.filter((x) => x.day !== r.day), r].sort((a, b) => a.day.localeCompare(b.day)) };
          }
          AsyncStorage.setItem(cacheKey(userId), JSON.stringify(next)).catch(() => {});
          return next;
        });
      }),
    [onUploaded, userId],
  );

  const { weights, water } = useMemo(() => applyPending(base.weights, base.water, pending), [base, pending]);

  const setWeight = useCallback(
    (day: string, weight_kg: number) =>
      queue({ path: `${WEIGHTS}/${day}`, method: 'PUT', body: { weight_kg: Math.round(weight_kg * 10) / 10 }, label: `Weight ${weight_kg.toFixed(1)} kg` }),
    [queue],
  );
  const deleteWeight = useCallback(
    (day: string) => queue({ path: `${WEIGHTS}/${day}`, method: 'DELETE', label: 'Delete a weight' }),
    [queue],
  );
  // Water is sent as the day's total, so quick taps can be merged into one upload.
  const setWater = useCallback(
    (day: string, ml: number) =>
      queue({
        path: `${WATER}/${day}`,
        method: 'PUT',
        body: { ml: Math.max(0, Math.round(ml)) },
        label: `Water ${(ml / 1000).toFixed(2)} L`,
        coalesceKey: `water:${day}`,
      }),
    [queue],
  );

  const setGoals = useCallback(
    (changes: Partial<FitnessGoals>) =>
      setGoalsState((g) => {
        const next = { ...g, ...changes };
        AsyncStorage.setItem(goalsKey(userId), JSON.stringify(next)).catch(() => {});
        return next;
      }),
    [userId],
  );

  return { ready, weights, water, goals, setGoals, setWeight, deleteWeight, setWater };
}
