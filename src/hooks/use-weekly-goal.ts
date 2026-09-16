import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  GOALS_QK,
  GOAL_ACTIVITIES_QK,
  currentGoal,
  fetchGoalActivities,
  fetchGoals,
  goalForWeek,
  recentWeeks,
  startOfLocalWeek,
  summariseWeek,
} from "@/lib/training-goals";

/**
 * Weekly training goal + actual active practice time for the current week
 * and the recent weeks history. Reads the canonical practice_activities timer.
 */
export function useWeeklyGoal(userId: string | undefined, weeks = 8) {
  const goalsQ = useQuery({
    queryKey: userId ? GOALS_QK(userId) : ["training_goals", "anon"],
    enabled: !!userId,
    queryFn: () => fetchGoals(userId!),
  });

  const actsQ = useQuery({
    queryKey: userId ? GOAL_ACTIVITIES_QK(userId) : ["training_goal_activities", "anon"],
    enabled: !!userId,
    queryFn: () => fetchGoalActivities(userId!, Math.max(weeks, 12)),
  });

  const goals = goalsQ.data ?? [];
  const activities = actsQ.data ?? [];

  return useMemo(() => {
    const now = new Date();
    const weekStart = startOfLocalWeek(now);
    const goal = currentGoal(goals);
    const thisWeek = summariseWeek(activities, weekStart, goalForWeek(goals, weekStart), now);
    return {
      isLoading: goalsQ.isLoading || actsQ.isLoading,
      goal,
      goalMinutes: goal?.weekly_minutes ?? null,
      hasGoal: !!(goal?.weekly_minutes && goal.weekly_minutes > 0),
      thisWeek,
      history: recentWeeks(activities, goals, weeks, now),
    };
  }, [goals, activities, weeks, goalsQ.isLoading, actsQ.isLoading]);
}
