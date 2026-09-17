# JEKER — Project Management Web Application

A specialized, web-based project management system built to digitalize factory project execution, scheduling, S-Curve analysis, and budget monitoring.

---

## 📌 Project Overview

**JEKER** is designed according to corporate manufacturing project workflows and master planning methodologies (derived from `MASTER Project MGMT.xlsx` and Microsoft Project standards). It enforces strict WBS structuring, automated template instantiation, and department-level accountability.

### Core Architectural Concepts

1. **3-Tier WBS Hierarchy**:
   $$\text{Project} \longrightarrow \text{Main Job} \longrightarrow \text{Sub Main Job} \longrightarrow \text{Sub-Subtask}$$
   - **Main Job (Level 1)**: 17 fixed corporate master jobs representing the complete factory lifecycle.
   - **Sub Main Job (Level 2)**: 72 predefined jobs with fixed PIC department assignments.
   - **Sub-Subtask (Level 3)**: Dynamic, project-specific operational tasks created by project teams.

2. **Strict Admin Ownership Rule**:
   - One Admin can own **exactly one Project in total** across all companies.
   - Enforced across the database schema (`UNIQUE` constraint), backend request validation, and frontend interface.

3. **Automated Master Template Instantiation**:
   - Creating a project automatically provisions all 17 Main Jobs and 72 Sub Main Jobs with predefined department PICs in a single transaction.
   - Admin does not manually recreate the project structure.

4. **Role-Based Authorization**:
   - **Admin**: Full project management, project instantiation, and governance.
   - **PIC Roles**: Department-specific responsibilities (`Engineering`, `Procurement`, `Purchasing`, `Legal`, `Production`, `PPIC`, `HRGA`, `Finance`, `SHE`, `QC`, `Sales`, `IT`, `BUSDEV`).
   - Task checklists are restricted so that only the assigned department PIC or Admin can mark progress.

---

## 🚀 Key Modules

- **Dashboard**: High-level KPI indicators (Progress %, Active Main Jobs, Days Left, Budget Absorption), S-Curve preview, and fixed job status breakdown.
- **Projects**: Dynamic company layer (`Company` entity), project overview, and master template structure viewer.
- **Task Management**: Interactive 3-tier WBS hierarchy, predecessor dependencies (`FS`, `SS`, `FF`, `SF` with lag days), and role-gated checklist authorization.
- **Timeline (Gantt Chart)**: Visual schedule tracking with interactive timeline grid, milestone markers, and dependency indicators.
- **Weekly Progress**: Planned vs. actual progress tracking with automated deviation status alerts (On Track, At Risk, Critical Lag).
- **S-Curve Analytics**: Dual-mode interactive visualization (Cumulative % and Weekly %) with milestone projection and data table inspection.
- **Budget Monitoring**: Expense tracking categorized by Material, Jasa/Subkon, Sewa Alat, and Overhead with Rupiah currency formatting.

---

## 🛠️ Technology Stack

- **Backend**: [Laravel](https://laravel.com/) (PHP 8.3+)
- **Frontend**: [React](https://react.dev/) + [Tailwind CSS v4](https://tailwindcss.com/)
- **Charts & Visualization**: [Recharts](https://recharts.org/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Database**: SQLite (Development) / MySQL compatible
- **Bundler**: [Vite](https://vitejs.dev/)

---

## ⚙️ Installation & Setup

### 1. Prerequisites
- PHP 8.3 or higher
- Composer 2.x
- Node.js 18+ and npm

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
# Copy environment file
cp .env.example .env

# Generate application key
php artisan key:generate
```

### 4. Database Setup & Seeding
```bash
# Run database migrations and seed master data
php artisan migrate:fresh --seed
```
*Note: Seeders populate initial companies, department PIC accounts, and a sample project with the 17 fixed Main Jobs template.*

### 5. Compile Frontend Assets
```bash
# Development mode with hot reload
npm run dev

# Or build for production
npm run build
```

### 6. Run Application
```bash
php artisan serve
```
Open your browser and navigate to `http://localhost:8000`.

---

## 🧪 Testing

Automated feature tests verify role authorization, the Admin ownership constraint, and template cloning:

```bash
# Run all tests
php artisan test

# Run Admin ownership and project creation tests specifically
php artisan test --filter=AdminOwnershipAndProjectCreationTest
```

---

## 🔒 Security & Guidelines

- Standard Laravel best practices are followed for routing, Eloquent ORM, and CSRF/session protection.
- Sensitive environment variables and secrets must be configured in `.env` and never committed to version control.
