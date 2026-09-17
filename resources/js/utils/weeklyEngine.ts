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

  weeks.forEach(w => {
    let weekPlanned = 0;
    
    newProject.mainJobs.forEach(mj => {
      if (!mj.startDate || !mj.finishDate || !mj.weight) return;
      
      // Check if this Main Job is active during this week
      if (mj.startDate <= w.endDate && mj.finishDate >= w.startDate) {
        // Find how many total weeks this MJ spans
        let mjStartMs = new Date(mj.startDate).getTime();
        let mjEndMs = new Date(mj.finishDate).getTime();
        
        if (!isNaN(mjStartMs) && !isNaN(mjEndMs)) {
          const mjDurationDays = Math.ceil((mjEndMs - mjStartMs) / (1000 * 60 * 60 * 24)) + 1;
          const mjTotalWeeks = Math.ceil(mjDurationDays / 7) || 1;
          
          // Distribute weight equally across its weeks
          weekPlanned += mj.weight / mjTotalWeeks;
        }
      }
    });

    // Formatting nicely
    weekPlanned = parseFloat(weekPlanned.toFixed(2));
    plannedCumulative += weekPlanned;
    plannedCumulative = parseFloat(plannedCumulative.toFixed(2));

    // Preserve existing actual values if they exist
    const existingWeek = newProject.weeklyData?.find(ew => ew.week === w.week);
    const actualValue = existingWeek?.actual || 0; 
    
    actualCumulative += actualValue;
    actualCumulative = parseFloat(actualCumulative.toFixed(2));

    weeklyData.push({
      week: w.week,
      startDate: w.startDate,
      endDate: w.endDate,
      planned: weekPlanned,
      actual: actualValue,
      plannedCumulative,
      actualCumulative,
    });
  });

  newProject.weeklyData = weeklyData;
  return newProject;
}
