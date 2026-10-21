# PROVIS System Architecture & Folder Structure Guidelines

Dokumen ini menjelaskan arsitektur susunan folder (*folder structuring*) untuk PROVIS (Project Management System). Struktur ini dirancang dengan pendekatan **Modular Domain-Driven**, rapi, skalabel, dan 100% kompatibel ke belakang (*backward-compatible*).

---

## 1. Ikhtisar Arsitektur

- **Backend**: Laravel 11 (PHP 8.2+) dengan arsitektur Controller berbasis domain (`Admin`, `Auth`, `Project`, `User`).
- **Frontend**: React 18 + TypeScript + Inertia.js + Tailwind CSS.
- **Inertia Page Resolver**: Smart dual-lookup resolver yang mendukung *namespaced page path* (misal: `Project/DashboardPage`) maupun *legacy flat page name* (misal: `DashboardPage`).
- **Design System / UI**: Komponen modular atomik dan layout yang terisolasi di `resources/js/components/`.

---

## 2. Struktur Backend (`app/Http/Controllers/`)

Controller dikelompokkan ke dalam subdirektori berdasarkan domain fungsional:

```text
app/Http/Controllers/
├── Admin/
│   ├── SuperAdminController.php       # Portal SuperAdmin & sistem kontrol
│   ├── CompanyController.php          # Manajemen Perusahaan / Client
│   ├── DivisionController.php         # Manajemen Divisi kerja
│   ├── TemplateController.php         # BE-08: Master template management & reorder
│   └── DivisionApprovalController.php # BE-09: Multi-division request & approval workflow
├── Auth/
│   └── AuthController.php             # Login, logout, session auth
├── Project/
│   └── ProjectController.php          # CRUD project, WBS, gantt, budget, working tree, weights, dsb.
├── User/
│   └── UserManagementController.php   # Manajemen user, role, multi-division/company permission
├── Controller.php                     # Base controller
│
# Legacy Proxy Controllers (100% Backward Compatibility):
├── AuthController.php                 # extends Auth\AuthController
├── CompanyController.php              # extends Admin\CompanyController
├── DivisionController.php             # extends Admin\DivisionController
├── ProjectController.php              # extends Project\ProjectController
├── SuperAdminController.php           # extends Admin\SuperAdminController
└── UserManagementController.php       # extends User\UserManagementController
```

### Backend Domain Services (`app/Services/`)

Business logic, kalkulasi matematis, scheduling, dan validasi diisolasi di folder `app/Services/`:

```text
app/Services/
├── DependencyScheduler.php        # BE-01: Engine predecessor (FS,SS,FF,SF), lag/lead, cycle detection & boundary cascading
├── SCurvePredictionService.php    # BE-02: EVM-based S-Curve prediction (SPI, velocity, delay forecast)
├── WeightManagementService.php    # BE-03: Custom percentage management dengan validasi mutlak 100.00%
├── TaskOrderService.php           # BE-05: Sibling drag-and-drop reordering persistence
├── MasterTemplateService.php      # BE-08: Dynamic database templates & non-retroactive project cloning
├── DivisionApprovalService.php    # BE-09: Alur pengajuan & approval multi-divisi worker
├── ProgressService.php            # Kalkulasi agregasi progres proyek
└── WeeklyService.php              # Agregasi data mingguan S-Curve
```

> **Catatan Pengembangan**:
> Controller hanya bertindak sebagai *HTTP entrypoint / dispatcher*. Seluruh komputasi berat (seperti formula EVM S-Curve, cascading scheduling, dan validasi bobot 100%) dijalankan oleh Service class terkait di `app/Services/`.

---

## 3. Struktur Frontend (`resources/js/`)

Sesuai kebutuhan sinkronisasi dengan kolaborator di GitHub agar tidak terjadi konflik merge, struktur frontend (`resources/js/`) tetap mempertahankan susunan standar:

```text
resources/js/
├── components/
│   ├── Layout.tsx             # Main project application layout & navigation
│   ├── SuperAdminLayout.tsx   # SuperAdmin portal layout & sidebar
│   ├── ChangePasswordModal.tsx# Dialog ganti password
│   ├── CustomSelect.tsx       # Custom dropdown selector
│   ├── ErrorBoundary.tsx      # React error boundary
│   └── ui.tsx                 # Atomic UI components (Button, Modal, Card, dsb.)
├── pages/
│   ├── SuperAdmin/            # Khusus modul portal SuperAdmin
│   │   ├── AdminLoginPage.tsx
│   │   ├── AllProjectsPage.tsx
│   │   ├── AuditLogPage.tsx
│   │   ├── CompaniesPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── DivisionsPage.tsx
│   │   └── UserManagementPage.tsx
│   ├── BudgetPage.tsx
│   ├── DashboardPage.tsx
│   ├── DivisionProgressPage.tsx
│   ├── LoginPage.tsx
│   ├── PredecessorManagerPage.tsx
│   ├── ProjectDetailPage.tsx
│   ├── ProjectListPage.tsx
│   ├── ProjectSetupPage.tsx
│   ├── ProjectsListPage.tsx
│   ├── SCurvePage.tsx
│   ├── TasksPage.tsx
│   ├── TimelinePage.tsx
│   ├── TodayTasksPage.tsx
│   ├── UserManagementPage.tsx
│   └── WeeklyPage.tsx
├── data/
├── main.tsx
└── index.css
```

---

## 4. Scripts & Development Tools (`tools/scripts/`)

File skrip CLI / seeder / Puppeteer / utility diletakkan di dalam folder `tools/scripts/`:

```text
tools/
└── scripts/
    ├── rewrite_user_management.php
    ├── update_seeder.php
    ├── run_puppeteer.cjs
    └── scratch_restore_all.cjs
```

---

## 5. Panduan Menambahkan Kode Baru

| Kebutuhan | Lokasi Folder | Contoh |
| :--- | :--- | :--- |
| **Halaman Fitur Baru** | `resources/js/pages/{Modul}/` | `resources/js/pages/Project/ReportPage.tsx` |
| **Komponen UI Umum** | `resources/js/components/ui/` | Button, Modal, Card di `components/ui/` |
| **Komponen Form/Shared** | `resources/js/components/common/` | DateRangePicker, Dropdown khusus |
| **Modal / Dialog** | `resources/js/components/modals/` | ConfirmDeleteModal.tsx |
| **TypeScript Type/Interface** | `resources/js/types/` | Tambah di file sesuai domain lalu export di `types/index.ts` |
| **Backend Controller Baru** | `app/Http/Controllers/{Domain}/` | `app/Http/Controllers/Report/ReportController.php` |
| **Maintenance Script** | `tools/scripts/` | `tools/scripts/migrate_v2.php` |
