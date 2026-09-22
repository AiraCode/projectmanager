import { Project, Status } from '../data/mockData';

function getStatusFromProgress(progress: number, currentStatus: Status): Status {
  if (progress === 100) return 'Completed';
  if (progress > 0 && currentStatus === 'Open') return 'On Track';
  if (progress === 0 && currentStatus === 'Completed') return 'Open';
  return currentStatus;
}

export function recalculateProgress(project: Project): Project {
  // Deep clone to avoid mutating the original reference directly
  const newProject = JSON.parse(JSON.stringify(project)) as Project;

  let totalProjectWeight = 0;
  let totalProjectWeightedProgress = 0;

  for (const mj of newProject.mainJobs) {
    let totalMjWeight = 0;
    let totalMjWeightedProgress = 0;

    for (const smj of mj.subMainJobs) {
      
      // 1. Calculate SMJ Progress based on Sub-Subtasks
      if (smj.subtasks && smj.subtasks.length > 0) {
        const totalTaskWeight = smj.subtasks.reduce((acc, st) => acc + (Number(st.weight) || 0), 0);
        if (totalTaskWeight > 0) {
          const weightedCompleted = smj.subtasks
            .filter(st => st.checked)
            .reduce((acc, st) => acc + (Number(st.weight) || 0), 0);
          smj.progress = Math.round((weightedCompleted / totalTaskWeight) * 100);
        } else {
          const completedCount = smj.subtasks.filter(st => st.checked).length;
          smj.progress = Math.round((completedCount / smj.subtasks.length) * 100);
        }
        
        // Also update individual subtask status/progress
        smj.subtasks.forEach(st => {
          st.progress = st.checked ? 100 : 0;
          st.status = getStatusFromProgress(st.progress, st.status);
        });
      }
      
      smj.status = getStatusFromProgress(smj.progress, smj.status);

      // Accumulate for Main Job
      const smjWeight = smj.weight || 0;
      totalMjWeight += smjWeight;
      totalMjWeightedProgress += (smj.progress * smjWeight);
    }

    // 2. Calculate Main Job Progress based on Sub Main Jobs
    if (totalMjWeight > 0) {
      mj.progress = Math.round(totalMjWeightedProgress / totalMjWeight);
    }
    
    mj.status = getStatusFromProgress(mj.progress, mj.status);

    // Accumulate for Overall Project
    const mjWeight = mj.weight || 0;
    totalProjectWeight += mjWeight;
    totalProjectWeightedProgress += (mj.progress * mjWeight);
  }

  // 3. Calculate Overall Project Progress
  if (totalProjectWeight > 0) {
    newProject.overallProgress = Math.round(totalProjectWeightedProgress / totalProjectWeight);
  }
  
  newProject.status = getStatusFromProgress(newProject.overallProgress, newProject.status);

  return newProject;
}
