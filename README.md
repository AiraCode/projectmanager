# PROVIS — Project Visibility & Management System

A comprehensive, enterprise-grade web-based project management platform designed to digitalize project planning, 3-tier WBS hierarchy, dynamic S-Curve EVM forecasting, predecessor scheduling, division accountability, and budget monitoring.

---

## 📌 Project Overview

**PROVIS** (Project Visibility & Management System) bridges master planning methodologies with real-time field execution. Originally derived from corporate master project management standards and Microsoft Project scheduling logic, PROVIS enforces structural discipline through automated WBS instantiation, dependency scheduling, granular multi-company permissions, and department-level accountability.

---

## 🏗️ Core Architectural Concepts

### 1. Flexible 3-Tier WBS Hierarchy
$$\text{Project} \longrightarrow \text{Main Task (Main WBS)} \longrightarrow \text{Sub Task (Sub WBS)} \longrightarrow \text{Sub-Subtask (Tasks)}$$
- **Main Task (Level 1)**: Primary project phases and major deliverable milestones.
- **Sub Task (Level 2)**: Departmental deliverables with assigned PIC divisions.
- **Sub-Subtask (Level 3)**: Actionable operational tasks with start/end dates, weights, assigned divisions, checklists, and execution evidence.
- **Dynamic Weight Management**: Weights automatically roll up from tasks to Sub WBS, Main WBS, and the overall Project, enforcing 100% allocation integrity.
- **Hierarchical Date Synchronization**: Parent WBS and Project start/end dates automatically expand or contract to envelop child task schedules.

### 2. Multi-Tier Role-Based Authorization & Permission Matrix
PROVIS implements a fine-grained permission matrix governing sidebar menus, feature access, and data scopes:
- **SuperAdmin**: Full system governance, template creation, company/division CRUD, division request approvals, and audit trail inspection.
- **Admin Utama**: High-level cross-company executive monitoring and portfolio oversight.
- **Admin Progres**: Dedicated progress auditor focused on project status, timeline adherence, and S-Curve analytics.
- **PIC (Project In Charge / Project Manager)**: Project owner responsible for project configuration (Setup Wizard), WBS customization, member assignment, weekly progress recording, and budget tracking. PICs can manage multiple projects when granted permission.
- **Worker**: Operational field member scoped to their assigned company and division. Workers view assigned tasks, update completion status, and upload task execution evidence.

### 3. Master Templates & Setup Wizard
- **SuperAdmin Template Management**: Manage reusable master WBS templates with customizable Main Tasks and Sub Tasks.
- **Automated Date Scaling**: When applying a template, task durations scale automatically to match the target project timeline.
- **Project Setup Wizard**: Newly created projects enter a guided setup mode where the PIC can fine-tune WBS structures, dependencies, and weights before publishing.

### 4. Advanced Predecessor & Dependency Engine
- Supports 4 standard dependency link types:
  - **Finish-to-Start (FS)**: Successor cannot start until predecessor finishes.
  - **Start-to-Start (SS)**: Successor cannot start until predecessor starts.
  - **Finish-to-Finish (FF)**: Successor cannot finish until predecessor finishes.
  - **Start-to-Finish (SF)**: Successor cannot finish until predecessor starts.
- Incorporates lead and lag days with cycle detection and automatic cascade scheduling (`DependencyScheduler`).
- Interactive visual dependency flow powered by `@xyflow/react`.

### 5. Multi-Company & Working Tree Governance
- Projects belong to corporate entities (`Company`), enabling multi-tenant enterprise deployment.
- Users can be assigned to multiple companies (with agreement verification).
- Project managers can assign specific team members to the project's Working Tree.

---

## 🚀 Key Modules & Features

| Module | Description |
| :--- | :--- |
| **Project Portfolio** | High-level portfolio overview with progress indicators, company filters, and private/public project visibility controls. |
| **Project Dashboard** | Real-time KPI summaries (Overall Progress %, Planned vs Actual, Days Remaining, Budget Absorption, Active WBS count). |
| **Interactive WBS & Task Management** | Drag-and-drop reordering, inline editing, division assignment, predecessor mapping, and weight recalculation. |
| **Timeline (Gantt Chart)** | Visual scheduling grid with milestone markers, duration bars, and dependency relationship indicators. |
| **Today's Tasks** | Quick operational view of tasks scheduled, active, or due today for immediate field focus. |
| **Weekly Progress Tracking** | Weekly planned vs. actual progress recording with automatic variance detection (**On Track**, **At Risk**, **Critical Lag**). |
| **S-Curve Analytics & EVM Forecasting** | Dual-mode interactive visualization (Cumulative % & Weekly %) with Earned Value Management (EVM: PV, EV, AC) and dynamic completion forecasting (`SCurvePredictionService`). |
| **Division Progress & Speedometer** | Department-level progress breakdowns with dynamic glowing speedometer gauges and accountability metrics. |
| **Budget Monitoring** | Categorized expense ledger (Material, Jasa/Subkon, Sewa Alat, Overhead) with Rupiah (IDR) currency formatting and variance calculation. |
| **Evidence & Storage Serving** | File and photo uploads for task completion proof, with secure in-browser PDF preview serving. |
| **SuperAdmin Control Center** | Dedicated administrative hub for managing Users, Companies, Master Templates, Divisions, Division Requests, and System Audit Logs. |

---

## 🛠️ Technology Stack

- **Backend Framework**: [Laravel](https://laravel.com/) (PHP 8.3+)
- **SPA Bridge**: [Inertia.js](https://inertiajs.com/) (React adapter)
- **Frontend Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **State & Data Visualization**:
  - [Recharts](https://recharts.org/) (S-Curve & KPI charts)
  - [@xyflow/react](https://reactflow.dev/) (Interactive Predecessor Dependency Graph)
  - [Lucide React](https://lucide.dev/) (Icons)
- **Database**: MySQL 8.x
- **Build Tool**: [Vite](https://vitejs.dev/)

---

## ⚙️ Installation & Setup

### 1. Prerequisites
- **PHP 8.3** or higher
- **Composer 2.x**
- **Node.js 18+** and **npm**
- **MySQL 8.x** or MariaDB

### 2. Clone & Install Dependencies
```bash
# Clone the repository
git clone https://github.com/AiraCode/projectmanager.git
cd projectmanager

# Install PHP dependencies
composer install

# Install Frontend dependencies
npm install
```

### 3. Environment Configuration
```bash
# Copy example environment configuration
cp .env.example .env

# Generate application key
php artisan key:generate
```
*Configure your MySQL database credentials (`DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`) in the `.env` file.*

### 4. Database Setup & Seeding
```bash
# Run migrations and populate initial master data
php artisan migrate:fresh --seed
```

### 5. Compile Frontend Assets
```bash
# Run Vite development server with hot module replacement (HMR)
npm run dev

# Or compile production bundle
npm run build
```

### 6. Run Application
```bash
php artisan serve
```
Access the application in your browser at `http://localhost:8000`.

---

## 👥 Default Demo Credentials

All seeded accounts use the default password: **`admin123`**

| Role | Email | Description / Scope |
| :--- | :--- | :--- |
| **SuperAdmin** | `superadmin@provis.id` | Global System Administration, Templates, Audit Logs |
| **Admin Utama** | `admin@provis.id` | Executive Cross-Company Portfolio Oversight |
| **Admin Progres** | `progres@provis.id` | Portfolio Monitoring & S-Curve Reporting |
| **PIC (PT. Karabha Wiratama)** | `pic1@provis.id` | Project Manager for *KWT Project* |
| **PIC (PT. Indoprima Gemilang)** | `pic2@provis.id` | Project Manager for *Expansion Phase 1* |
| **PIC (PT. Indoprima Nusantara)** | `pic3@provis.id` | Project Manager for *Digital Transformation* |
| **Worker (Engineering)** | `engineering@provis.id` | Engineering Division Task Checklist & Evidence |
| **Worker (Produksi)** | `produksi@provis.id` | Production Division Task Checklist & Evidence |
| **Worker (Procurement)** | `procurement@provis.id` | Procurement Division Task Checklist & Evidence |

*Additional division accounts follow the pattern: `<division_name>@provis.id` (e.g., `purchasing@provis.id`, `qc@provis.id`, `finance@provis.id`).*

---

## 🧪 Testing

The test suite validates role-based authorization, multi-company isolation, dependency scheduling calculations, S-Curve EVM forecasting, and WBS integrity:

```bash
# Run all automated tests
php artisan test

# Run specific test suites
php artisan test --filter=DependencySchedulerTest
php artisan test --filter=AuthorizationTest
php artisan test --filter=MultiCompanyUserTest
php artisan test --filter=IntegrationServicesTest
```

---

## 🔒 Security & Best Practices

- **Strict Access Control**: Backend requests strictly enforce multi-company boundaries and role permission matrices.
- **Integrity Validation**: Weight distributions, dependency loops, and date formulas are verified at service layers.
- **Evidence Protection**: File downloads and evidence previews pass through sanitized storage controllers (`/storage/{path}`) preventing path traversal.
- **Audit Trails**: Critical system actions (project creation, status updates, template adjustments) are logged to `audit_logs`.
