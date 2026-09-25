import { Project, SubSubtask } from '../data/mockData';

export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function recalculateSchedule(project: Project): Project {
  // Deep clone to avoid mutating the original reference directly
  const newProject = JSON.parse(JSON.stringify(project)) as Project;
  
  // 1. Build a map of all tasks and sub-tasks by code for easy lookup
  type PredTarget = { startDate: string; finishDate: string };
  const taskMap = new Map<string, PredTarget>();
  
  for (const mj of newProject.mainJobs) {
    for (const smj of mj.subMainJobs) {
      if (smj.code && smj.startDate && smj.finishDate) {
        taskMap.set(smj.code, { startDate: smj.startDate, finishDate: smj.finishDate });
        taskMap.set(smj.id, { startDate: smj.startDate, finishDate: smj.finishDate });
      }
      for (const st of smj.subtasks) {
        taskMap.set(st.code, st);
        taskMap.set(st.id, st);
      }
    }
  }

  // 2. Relaxation algorithm to resolve dependency chains
  let changed = true;
  let iterations = 0;
  const MAX_ITER = taskMap.size + 1;

  while (changed && iterations < MAX_ITER) {
    changed = false;
    iterations++;

    for (const mj of newProject.mainJobs) {
      for (const smj of mj.subMainJobs) {
        for (const st of smj.subtasks) {
          
          let newStart = st.startDate;
          let newFinish = st.finishDate;
          
          if (st.predecessor && taskMap.has(st.predecessor)) {
            const pred = taskMap.get(st.predecessor)!;
            const lag = st.lag || 0;
            const duration = st.duration || 1;

            if (st.depType === 'FS' || !st.depType) {
              newStart = addDays(pred.finishDate, lag);
              newFinish = addDays(newStart, duration - 1);
            } else if (st.depType === 'SS') {
              newStart = addDays(pred.startDate, lag);
              newFinish = addDays(newStart, duration - 1);
            } else if (st.depType === 'FF') {
              newFinish = addDays(pred.finishDate, lag);
              newStart = addDays(newFinish, -(duration - 1));
            } else if (st.depType === 'SF') {
              newFinish = addDays(pred.startDate, lag);
              newStart = addDays(newFinish, -(duration - 1));
            }
          } else {
            // No predecessor: Start date remains as user-entered.
            // Just ensure finish date is consistent with duration.
            const duration = st.duration || 1;
            newFinish = addDays(st.startDate, duration - 1);
          }

          if (newStart !== st.startDate || newFinish !== st.finishDate) {
            st.startDate = newStart;
            st.finishDate = newFinish;
            changed = true;
            taskMap.set(st.code, st);
          }
        }
      }
    }
  }

  // 3. Roll up dates and recalculate Days Left
  const today = new Date().toISOString().slice(0, 10);

  for (const mj of newProject.mainJobs) {
    let mjStart: string | null = null;
    let mjFinish: string | null = null;

    for (const smj of mj.subMainJobs) {
      let smjStart: string | null = null;
      let smjFinish: string | null = null;

      for (const st of smj.subtasks) {
        // Update days left
        if (st.status === 'Completed' || st.checked) {
          st.daysLeft = 0;
        } else if (st.finishDate >= today) {
          const diffTime = Math.abs(new Date(st.finishDate).getTime() - new Date(today).getTime());
          st.daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } else {
          st.daysLeft = 0; // Overdue
        }

        // Roll up to Sub Main Job
        if (!smjStart || st.startDate < smjStart) smjStart = st.startDate;
        if (!smjFinish || st.finishDate > smjFinish) smjFinish = st.finishDate;
      }
      
      if (smjStart) smj.startDate = smjStart;
      if (smjFinish) smj.finishDate = smjFinish;

      // Roll up to Main Job
      if (!mjStart || smj.startDate < mjStart) mjStart = smj.startDate;
      if (!mjFinish || smj.finishDate > mjFinish) mjFinish = smj.finishDate;
    }

    if (mjStart) mj.startDate = mjStart;
    if (mjFinish) mj.finishDate = mjFinish;
  }

  return newProject;
}
