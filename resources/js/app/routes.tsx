import { createHashRouter, Navigate } from 'react-router';
import { lazy, Suspense } from 'react';
import Layout from '@/components/Layout';
import LoginPage from '@/pages/LoginPage';

const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const ProjectDetailPage = lazy(() => import('@/pages/ProjectDetailPage'));
const TasksPage = lazy(() => import('@/pages/TasksPage'));
const TimelinePage = lazy(() => import('@/pages/TimelinePage'));
const WeeklyPage = lazy(() => import('@/pages/WeeklyPage'));
const SCurvePage = lazy(() => import('@/pages/SCurvePage'));
const BudgetPage = lazy(() => import('@/pages/BudgetPage'));

const PageLoader = () => (
  <div className="flex items-center justify-center h-64">
    <div className="flex gap-1.5">
      {[0,1,2].map(i => (
        <div key={i} className="w-2 h-2 rounded-full bg-brand animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  </div>
);

const wrap = (C: React.ComponentType) => (
  <Suspense fallback={<PageLoader />}><C /></Suspense>
);

export const router = createHashRouter([
  { path: '/login', Component: LoginPage },
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: wrap(DashboardPage) },
      { path: 'project', element: wrap(ProjectDetailPage) },
      { path: 'tasks', element: wrap(TasksPage) },
      { path: 'timeline', element: wrap(TimelinePage) },
      { path: 'weekly', element: wrap(WeeklyPage) },
      { path: 'scurve', element: wrap(SCurvePage) },
      { path: 'budget', element: wrap(BudgetPage) },
    ],
  },
]);
