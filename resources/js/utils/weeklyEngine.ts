import { Project, WeekData } from '../data/mockData';

// Helper to add days to a YYYY-MM-DD string
function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function recalculateWeeklyData(project: Project): Project {
  // Deep clone
  const newProject = JSON.parse(JSON.stringify(project)) as Project;
  
  // 1. Determine overall project start and end dates based on all tasks
  let minDateStr = newProject.startDate;
  let maxDateStr = newProject.endDate;

  newProject.mainJobs.forEach(mj => {
    if (mj.startDate && mj.startDate < minDateStr) minDateStr = mj.startDate;
    if (mj.finishDate && mj.finishDate > maxDateStr) maxDateStr = mj.finishDate;
  });

  newProject.startDate = minDateStr;
  newProject.endDate = maxDateStr;

  // 2. Generate Week boundaries
  const weeks: { week: number; startDate: string; endDate: string }[] = [];
  let currentStart = minDateStr;
  let weekNum = 1;
  
  // Create weeks until we cover the maxDateStr
  while (currentStart <= maxDateStr) {
    const currentEnd = addDays(currentStart, 6); // 7 days inclusive (e.g., Mon-Sun)
    weeks.push({
      week: weekNum,
      startDate: currentStart,
      endDate: currentEnd,
    });
    currentStart = addDays(currentEnd, 1);
    weekNum++;
  }

  // 3. Distribute Planned Progress and recalculate cumulatives
  const weeklyData: WeekData[] = [];
  let plannedCumulative = 0;
  let actualCumulative = 0;

  // Normalize total weights across all Main Jobs to 100%
  const rawTotalWeight = newProject.mainJobs.reduce((sum, mj) => sum + (Number(mj.weight) || 0), 0);
  const weightNormalizer = rawTotalWeight > 0 ? 100 / rawTotalWeight : 1;

  // Identify current week index based on today's date
  const todayStr = new Date().toISOString().slice(0, 10);
  let currentWeekIdx = weeks.findIndex(w => todayStr >= w.startDate && todayStr <= w.endDate);
  if (currentWeekIdx === -1) {
    if (weeks.length > 0 && todayStr < weeks[0].startDate) {
      currentWeekIdx = 0;
    } else {
      currentWeekIdx = Math.max(0, weeks.length - 1);
    }
  }

  // Check if explicit weekly actual entries exist in DB
  const savedActuals = (newProject as any).savedWeeklyActuals || {};
  const hasSavedActuals = Object.keys(savedActuals).some(
    k => savedActuals[k] !== undefined && savedActuals[k] !== null && Number(savedActuals[k]) > 0
  );

  const overallActual = Number(newProject.overallProgress || 0);

  weeks.forEach((w, idx) => {
    let weekPlanned = 0;

    newProject.mainJobs.forEach(mj => {
      const mjWeight = (Number(mj.weight) || 0) * weightNormalizer;
      if (!mj.startDate || !mj.finishDate || mjWeight <= 0) return;

      // Check if this Main Job is active during this week
      if (mj.startDate <= w.endDate && mj.finishDate >= w.startDate) {
        const mjStartMs = new Date(mj.startDate).getTime();
        const mjEndMs = new Date(mj.finishDate).getTime();

        if (!isNaN(mjStartMs) && !isNaN(mjEndMs)) {
          const mjDurationDays = Math.ceil((mjEndMs - mjStartMs) / (1000 * 60 * 60 * 24)) + 1;
          const mjTotalWeeks = Math.ceil(mjDurationDays / 7) || 1;
          weekPlanned += mjWeight / mjTotalWeeks;
        }
      }
    });

    weekPlanned = parseFloat(weekPlanned.toFixed(2));
    plannedCumulative += weekPlanned;
    plannedCumulative = parseFloat(plannedCumulative.toFixed(2));

    // Cap planned cumulative at 100% on or near the final week
    if (idx === weeks.length - 1) {
      plannedCumulative = 100.00;
    } else if (plannedCumulative > 100) {
      plannedCumulative = 100.00;
    }

    // Determine actual progress for this week:
    let actualValue = 0;
    const isElapsed = idx <= currentWeekIdx;

    if (hasSavedActuals) {
      // Use explicitly saved weekly actuals from DB
      const existingWeek = newProject.weeklyData?.find(ew => ew.week === w.week);
      const saved = savedActuals[w.week];
      actualValue = saved !== undefined ? Number(saved) : (existingWeek?.actual || 0);
      actualCumulative += actualValue;
      actualCumulative = parseFloat(actualCumulative.toFixed(2));
    } else if (isElapsed && overallActual > 0) {
      // If no explicit weekly actuals saved yet, distribute the project's actual overallProgress
      // smoothly up to the current week
      const targetCumulative = parseFloat(
        (((idx + 1) / (currentWeekIdx + 1)) * overallActual).toFixed(2)
      );
      actualValue = parseFloat((targetCumulative - actualCumulative).toFixed(2));
      if (actualValue < 0) actualValue = 0;
      actualCumulative = targetCumulative;
    } else {
      actualValue = 0;
    }

    weeklyData.push({
      week: w.week,
      startDate: w.startDate,
      endDate: w.endDate,
      planned: weekPlanned,
      actual: isElapsed ? actualValue : 0,
      plannedCumulative,
      actualCumulative: isElapsed ? actualCumulative : 0,
    });
  });

  newProject.weeklyData = weeklyData;
  return newProject;
}
