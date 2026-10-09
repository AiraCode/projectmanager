import { MainJob, SubSubtask } from '../data/mockData';

export function canStartTask(task: SubSubtask, mainJobs: MainJob[]): boolean {
  const tasks = mainJobs.flatMap(main => main.subMainJobs.flatMap(sub => sub.subtasks));
  const findPredecessor = (id: string) =>
    tasks.find(candidate => candidate.id === id || candidate.code === id);

  if (task.dependencies?.length) {
    return task.dependencies.every(dependency => {
      const predecessor = findPredecessor(dependency.predecessor_wbs_id);
      if (!predecessor) return true;

      switch (dependency.dependency_type) {
        case 'FS':
          return predecessor.progress >= 100 || predecessor.checked;
        case 'SS':
          return predecessor.progress > 0 || predecessor.checked;
        case 'FF':
        case 'SF':
          return true;
      }
      return true;
    });
  }

  if (!task.predecessor) return true;
  const predecessor = findPredecessor(task.predecessor);
  if (!predecessor) return true;

  switch (task.depType) {
    case 'FS':
    case undefined:
      return predecessor.progress >= 100 || predecessor.checked;
    case 'SS':
      return predecessor.progress > 0 || predecessor.checked;
    case 'FF':
    case 'SF':
      return true;
  }
  return true;
}
