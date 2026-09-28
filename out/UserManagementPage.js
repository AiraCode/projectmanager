"use strict";
(() => {
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });

  // resources/js/pages/UserManagementPage.tsx
  var import_react = __require("react");
  var import_react2 = __require("@inertiajs/react");
  var import_ui = __require("@/components/ui");
  var import_lucide_react = __require("lucide-react");
  var import_jsx_runtime = __require("react/jsx-runtime");
  var MODULE_PERMISSIONS = [
    { module: "Dashboard", sidebarKey: "Dashboard", features: [] },
    { module: "Project Detail", sidebarKey: "Project Detail", features: [] },
    { module: "Tasks", sidebarKey: "Tasks", featureGroup: "tasks", features: ["create", "edit", "delete", "Edit Task"] },
    { module: "Today's Tasks", sidebarKey: "Today's Tasks", features: [] },
    { module: "Timeline", sidebarKey: "Timeline", features: [] },
    { module: "Weekly Progress", sidebarKey: "Weekly Progress", featureGroup: "weekly", features: ["submit", "edit", "delete"] },
    { module: "S-Curve Report", sidebarKey: "S-Curve Report", featureGroup: "reports", features: [] },
    { module: "Budget Management", sidebarKey: "Budget Management", featureGroup: "budget", features: ["create", "edit", "delete"] },
    { module: "Division Progress", sidebarKey: "Division Progress", features: [] },
    { module: "User Management", sidebarKey: "User Management", featureGroup: "users", features: ["create", "edit"] }
  ];
  function UserManagementPage({
    users,
    companies,
    divisions,
    roles,
    currentUser,
    projects = []
  }) {
    const [toast, setToast] = (0, import_react.useState)(null);
    const [modalOpen, setModalOpen] = (0, import_react.useState)(false);
    const [editingUser, setEditingUser] = (0, import_react.useState)(null);
    const [isGlobalMatrixOpen, setIsGlobalMatrixOpen] = (0, import_react.useState)(false);
    const [isProjectAccessOpen, setIsProjectAccessOpen] = (0, import_react.useState)(false);
    const [viewMode, setViewMode] = (0, import_react.useState)("manage");
    const [filterRole, setFilterRole] = (0, import_react.useState)("");
    const [filterCompany, setFilterCompany] = (0, import_react.useState)("");
    const [activeMatrixTab, setActiveMatrixTab] = (0, import_react.useState)(null);
    const [filterDivision, setFilterDivision] = (0, import_react.useState)("");
    const isSuperAdmin = currentUser.role?.name === "SuperAdmin";
    const isPIC = currentUser.role?.name === "pic";
    const canCreate = isSuperAdmin || isPIC && currentUser.permission_matrix?.features?.users?.includes("create");
    const canEditAny = isSuperAdmin || isPIC && currentUser.permission_matrix?.features?.users?.includes("edit");
    const { data, setData, post, put, delete: destroy, processing, errors, reset } = (0, import_react2.useForm)({
      username: "",
      email: "",
      password: "",
      roles_id: "",
      companies_id: "",
      divisions_id: "",
      permission_matrix: {
        sidebar: [],
        features: {},
        data_scope: "own_company",
        project_access: {}
      }
    });
    const openModal = (user = null) => {
      setEditingUser(user);
      if (user) {
        setData({
          username: user.username,
          email: user.email,
          password: "",
          roles_id: user.roles_id?.toString() || "",
          companies_id: user.companies_id?.toString() || "",
          divisions_id: user.divisions_id?.toString() || "",
          permission_matrix: user.permission_matrix || { sidebar: [], features: {}, data_scope: "own_company", project_access: {} }
        });
      } else {
        setData({
          username: "",
          email: "",
          password: "",
          roles_id: "",
          companies_id: "",
          divisions_id: "",
          permission_matrix: { sidebar: [], features: {}, data_scope: "own_company", project_access: {} }
        });
      }
      setModalOpen(true);
    };
    const closeModal = () => {
      setModalOpen(false);
      reset();
    };
    const handleSubmit = (e) => {
      e.preventDefault();
      if (editingUser) {
        put(`/users/${editingUser.id}`, {
          onSuccess: () => {
            closeModal();
            setToast({ msg: "User updated successfully", type: "success" });
          },
          onError: () => setToast({ msg: "Error updating user", type: "danger" })
        });
      } else {
        post("/users", {
          onSuccess: () => {
            closeModal();
            setToast({ msg: "User created successfully", type: "success" });
          },
          onError: () => setToast({ msg: "Error creating user", type: "danger" })
        });
      }
    };
    const handleDelete = (id) => {
      if (confirm("Are you sure you want to delete this user?")) {
        destroy(`/users/${id}`, {
          onSuccess: () => setToast({ msg: "User deleted successfully", type: "success" }),
          onError: () => setToast({ msg: "Error deleting user", type: "danger" })
        });
      }
    };
    const handleUnifiedViewToggle = (mod) => {
      const targetMatrix = activeMatrixTab ? data.permission_matrix.per_project && data.permission_matrix.per_project[activeMatrixTab] || { sidebar: [], features: {}, data_scope: "own_company" } : data.permission_matrix;
      const currentSidebar = targetMatrix.sidebar || [];
      const isCurrentlyView = currentSidebar.includes(mod.sidebarKey);
      const updatedSidebar = isCurrentlyView ? currentSidebar.filter((s) => s !== mod.sidebarKey) : [...currentSidebar, mod.sidebarKey];
      let updatedFeatures = { ...targetMatrix.features || {} };
      if (mod.featureGroup) {
        const currentActions = updatedFeatures[mod.featureGroup] || [];
        if (isCurrentlyView) {
          updatedFeatures[mod.featureGroup] = currentActions.filter((a) => a !== "view");
        } else {
          updatedFeatures[mod.featureGroup] = [...currentActions.filter((a) => a !== "view"), "view"];
        }
      }
      if (activeMatrixTab) {
        setData("permission_matrix", {
          ...data.permission_matrix,
          per_project: {
            ...data.permission_matrix.per_project || {},
            [activeMatrixTab]: {
              ...targetMatrix,
              sidebar: updatedSidebar,
              features: updatedFeatures
            }
          }
        });
      } else {
        setData("permission_matrix", {
          ...data.permission_matrix,
          sidebar: updatedSidebar,
          features: updatedFeatures
        });
      }
    };
    const handleFeatureToggle = (feature, action) => {
      const targetMatrix = activeMatrixTab ? data.permission_matrix.per_project && data.permission_matrix.per_project[activeMatrixTab] || { sidebar: [], features: {}, data_scope: "own_company" } : data.permission_matrix;
      const currentFeat = targetMatrix.features || {};
      const currentActions = currentFeat[feature] || [];
      const updatedActions = currentActions.includes(action) ? currentActions.filter((a) => a !== action) : [...currentActions, action];
      if (activeMatrixTab) {
        setData("permission_matrix", {
          ...data.permission_matrix,
          per_project: {
            ...data.permission_matrix.per_project || {},
            [activeMatrixTab]: {
              ...targetMatrix,
              features: { ...currentFeat, [feature]: updatedActions }
            }
          }
        });
      } else {
        setData("permission_matrix", { ...data.permission_matrix, features: { ...currentFeat, [feature]: updatedActions } });
      }
    };
    const handleProjectAccessToggle = (projectId, accessType) => {
      const currentAccess = data.permission_matrix.project_access || {};
      const projectAccess = currentAccess[projectId] || { view_project: false, view_progress: false };
      const newAccess = { ...projectAccess, [accessType]: !projectAccess[accessType] };
      if (accessType === "view_project" && !newAccess.view_project) {
        newAccess.view_progress = false;
      }
      setData("permission_matrix", {
        ...data.permission_matrix,
        project_access: {
          ...currentAccess,
          [projectId]: newAccess
        }
      });
    };
    const selectedRoleName = roles.find((r) => r.id.toString() === data.roles_id)?.name;
    useEffect(() => {
      if (selectedRoleName === "worker" && (!data.permission_matrix.sidebar || data.permission_matrix.sidebar.length === 0)) {
        setData("permission_matrix", {
          ...data.permission_matrix,
          sidebar: ["Tasks", "Division Progress", "Weekly Progress"],
          features: {
            tasks: ["view", "toggle_status"],
            weekly: ["view"],
            reports: ["view"]
          }
        });
      }
    }, [selectedRoleName]);
    const isWorkerTarget = selectedRoleName === "worker";
    const isAdminTarget = selectedRoleName === "admin_utama" || selectedRoleName === "admin_progres";
    const showGlobalMatrix = (isSuperAdmin || isPIC) && selectedRoleName !== "SuperAdmin" && !isAdminTarget;
    const showDivision = selectedRoleName === "worker" || selectedRoleName === "worker_b";
    const activeProjects = Object.entries(data.permission_matrix.project_access || {}).filter(([_, access]) => access.view_project).map(([id]) => (projects || []).find((p) => p.id.toString() === id)).filter(Boolean);
    const isUnified = data.permission_matrix.is_unified !== false;
    const currentMatrixData = activeMatrixTab ? data.permission_matrix.per_project && data.permission_matrix.per_project[activeMatrixTab] || { sidebar: [], features: {}, data_scope: "own_company" } : data.permission_matrix;
    const filteredUsers = users.filter((u) => {
      if (filterRole && u.role?.name !== filterRole) return false;
      if (filterCompany && u.companies_id?.toString() !== filterCompany) return false;
      if (filterDivision && u.divisions_id?.toString() !== filterDivision) return false;
      return true;
    });
    const renderForm = () => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", { onSubmit: handleSubmit, className: "space-y-5", children: [
      (isSuperAdmin || viewMode === "create" && canCreate || editingUser && canEditAny) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "block text-[12px] font-bold text-neutral-700 mb-1", children: "Username" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "text", value: data.username, onChange: (e) => setData("username", e.target.value), required: true, className: "w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-brand focus:border-brand" }),
          errors.username && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-danger text-[11px] mt-1", children: errors.username })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "block text-[12px] font-bold text-neutral-700 mb-1", children: "Email" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "email", value: data.email, onChange: (e) => setData("email", e.target.value), required: true, className: "w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-brand focus:border-brand" }),
          errors.email && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-danger text-[11px] mt-1", children: errors.email })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "block text-[12px] font-bold text-neutral-700 mb-1", children: [
            "Password ",
            editingUser && "(Leave blank to keep)",
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "block text-[10px] font-normal text-neutral-500 mt-0.5", children: "Min. 8 characters, 1 letter, 1 number" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              type: "password",
              value: data.password,
              onChange: (e) => setData("password", e.target.value),
              required: !editingUser,
              placeholder: !editingUser ? "Min 8 chars, 1 letter, 1 number" : "Leave blank to keep current",
              pattern: "^(?=.*[a-zA-Z])(?=.*[0-9]).{8,}$",
              title: "Password must contain at least 8 characters, including 1 letter and 1 number.",
              className: "w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-brand focus:border-brand"
            }
          ),
          errors.password && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-danger text-[11px] mt-1", children: errors.password })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "block text-[12px] font-bold text-neutral-700 mb-1", children: "Role" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { value: data.roles_id, onChange: (e) => setData("roles_id", e.target.value), required: true, className: "w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-brand focus:border-brand", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "Select Role" }),
            roles.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: r.id, children: r.name }, r.id))
          ] })
        ] }),
        showGlobalMatrix && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "block text-[12px] font-bold text-neutral-700 mb-1", children: "Company" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { value: data.companies_id, onChange: (e) => setData("companies_id", e.target.value), className: "w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-brand focus:border-brand", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "No Company" }),
            companies.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: c.id, children: c.name }, c.id))
          ] })
        ] }),
        showGlobalMatrix && showDivision && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "block text-[12px] font-bold text-neutral-700 mb-1", children: "Division" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { value: data.divisions_id, onChange: (e) => setData("divisions_id", e.target.value), className: "w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-brand focus:border-brand", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "No Division" }),
            divisions.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: d.id, children: d.divisi }, d.id))
          ] })
        ] })
      ] }),
      isPIC && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "bg-brand-light/30 border border-brand/20 p-4 rounded-xl text-[13px] text-brand-dark mb-4", children: "PIC mode: You are only allowed to modify project-specific access for workers in your company." }),
      isWorkerTarget && (isPIC || isSuperAdmin) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "border border-neutral-200 rounded-xl overflow-hidden mt-4", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            className: "bg-neutral-50 px-4 py-2 border-b border-neutral-200 flex justify-between items-center cursor-pointer hover:bg-neutral-100 transition-colors",
            onClick: () => setIsProjectAccessOpen(!isProjectAccessOpen),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { className: "font-bold text-[13px] flex items-center gap-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.FolderOpen, { size: 16, className: "text-brand" }),
                " Project Access Matrix (Initial Setup)"
              ] }),
              isProjectAccessOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.ChevronDown, { size: 16, className: "text-neutral-400" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.ChevronRight, { size: 16, className: "text-neutral-400" })
            ]
          }
        ),
        isProjectAccessOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "p-0", children: projects.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "p-5 text-center text-[13px] text-neutral-500", children: "No projects available in this company yet." }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "max-h-[300px] overflow-y-auto", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "w-full text-left text-[13px]", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { className: "bg-white text-neutral-500 font-semibold text-[11px] uppercase tracking-wider border-b border-neutral-200 sticky top-0 z-10 shadow-sm", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-2", children: "Project Name" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-2 text-center", children: "Can View Project" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-2 text-center", children: "Can View Progress" })
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { className: "divide-y divide-neutral-100", children: projects.map((proj) => {
            const access = data.permission_matrix.project_access?.[proj.id] || { view_project: false, view_progress: false };
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { className: "hover:bg-neutral-50/50", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-3 font-medium text-neutral-900", children: proj.title }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-3 text-center", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: access.view_project, onChange: () => handleProjectAccessToggle(proj.id, "view_project"), className: "rounded text-brand focus:ring-brand w-4 h-4 cursor-pointer" }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-3 text-center", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "checkbox",
                  checked: access.view_progress,
                  disabled: !access.view_project,
                  onChange: () => handleProjectAccessToggle(proj.id, "view_progress"),
                  className: `rounded w-4 h-4 ${!access.view_project ? "opacity-50 cursor-not-allowed text-neutral-400" : "text-brand focus:ring-brand cursor-pointer"}`
                }
              ) })
            ] }, proj.id);
          }) })
        ] }) }) })
      ] }),
      showGlobalMatrix && isWorkerTarget && activeProjects.length > 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "border border-neutral-200 rounded-xl overflow-hidden mt-4 p-4 bg-neutral-50 flex items-center justify-between", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: "font-bold text-[13px] text-neutral-800", children: "Unified Permission Settings" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-[11.5px] text-neutral-500", children: "Apply the same permissions across all assigned projects, or configure them individually." })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "flex items-center gap-2 text-[13px] font-bold text-neutral-800 cursor-pointer", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              type: "checkbox",
              checked: isUnified,
              onChange: (e) => {
                setData("permission_matrix", { ...data.permission_matrix, is_unified: e.target.checked });
                if (e.target.checked) setActiveMatrixTab(null);
              },
              className: "rounded text-brand focus:ring-brand w-4 h-4"
            }
          ),
          "Samakan semua settingan permission"
        ] })
      ] }),
      showGlobalMatrix && (!isUnified && activeProjects.length > 1) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "flex gap-2 mt-4 overflow-x-auto pb-2", children: activeProjects.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "button",
        {
          type: "button",
          onClick: () => {
            setActiveMatrixTab(p.id.toString());
            setIsGlobalMatrixOpen(true);
          },
          className: `px-4 py-2 rounded-lg font-bold text-[12px] whitespace-nowrap transition-colors ${activeMatrixTab === p.id.toString() ? "bg-brand text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`,
          children: [
            "Matrix - ",
            p.title
          ]
        },
        p.id
      )) }),
      showGlobalMatrix && (isUnified || activeProjects.length <= 1 || activeMatrixTab) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "border border-neutral-200 rounded-xl overflow-hidden mt-4", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            className: "bg-neutral-50 px-4 py-2 border-b border-neutral-200 flex justify-between items-center cursor-pointer hover:bg-neutral-100 transition-colors",
            onClick: () => setIsGlobalMatrixOpen(!isGlobalMatrixOpen),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Shield, { size: 16, className: "text-brand" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: "font-bold text-[13px]", children: activeMatrixTab ? `Permission Matrix - ${activeProjects.find((p) => p.id.toString() === activeMatrixTab)?.title}` : "Global Permission Matrix" }),
                isSuperAdmin && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-[10px] font-bold text-neutral-500 bg-white border border-neutral-200 px-1.5 py-0.5 rounded ml-2", children: "SuperAdmin Only" })
              ] }),
              isGlobalMatrixOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.ChevronDown, { size: 16, className: "text-neutral-400" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.ChevronRight, { size: 16, className: "text-neutral-400" })
            ]
          }
        ),
        isGlobalMatrixOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "p-4 space-y-5", children: [
          isSuperAdmin && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { className: "text-[12px] font-bold text-neutral-800 mb-2 uppercase tracking-wide", children: "Data Access Scope" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex gap-4 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200 w-fit", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "flex items-center gap-2 text-[13px] text-neutral-700 cursor-pointer", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "radio", name: "scope", value: "all", checked: currentMatrixData.data_scope === "all", onChange: () => setData("permission_matrix", activeMatrixTab ? { ...data.permission_matrix, per_project: { ...data.permission_matrix.per_project || {}, [activeMatrixTab]: { ...currentMatrixData, data_scope: "all" } } } : { ...data.permission_matrix, data_scope: "all" }), className: "text-brand focus:ring-brand cursor-pointer" }),
                " All Companies"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "flex items-center gap-2 text-[13px] text-neutral-700 cursor-pointer", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "radio", name: "scope", value: "own_company", checked: currentMatrixData.data_scope === "own_company", onChange: () => setData("permission_matrix", activeMatrixTab ? { ...data.permission_matrix, per_project: { ...data.permission_matrix.per_project || {}, [activeMatrixTab]: { ...currentMatrixData, data_scope: "own_company" } } } : { ...data.permission_matrix, data_scope: "own_company" }), className: "text-brand focus:ring-brand cursor-pointer" }),
                " Own Company Only"
              ] })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { className: "text-[12px] font-bold text-neutral-800 mb-2 uppercase tracking-wide", children: "Module Access & Features" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "overflow-x-auto border border-neutral-200 rounded-lg", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "w-full text-left text-[12.5px]", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { className: "bg-neutral-50 border-b border-neutral-200 font-semibold text-neutral-600 text-[11px] uppercase tracking-wider", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-2.5", children: "Module Name" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-2.5 text-center border-l border-neutral-100", children: "View (Sidebar)" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-2.5 text-center border-l border-neutral-100 w-1/2", children: "Advanced Permissions" })
              ] }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { className: "divide-y divide-neutral-100", children: MODULE_PERMISSIONS.map((mod) => {
                const disableForPic = isPIC && mod.sidebarKey === "User Management";
                if (disableForPic || isWorkerTarget && mod.sidebarKey === "User Management") return null;
                const isView = (currentMatrixData.sidebar || []).includes(mod.sidebarKey);
                return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { className: "hover:bg-neutral-50/50", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2.5 font-semibold text-neutral-800", children: mod.module }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2.5 text-center border-l border-neutral-100", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "input",
                    {
                      type: "checkbox",
                      checked: isView,
                      onChange: () => handleUnifiedViewToggle(mod),
                      className: "rounded text-brand focus:ring-brand w-4 h-4 cursor-pointer"
                    }
                  ) }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2.5 border-l border-neutral-100", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "flex flex-wrap gap-4 items-center justify-center", children: mod.features.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-neutral-400 italic text-[11px]", children: "- None available -" }) : mod.features.map((feat) => {
                    const isChecked = mod.featureGroup ? (currentMatrixData.features?.[mod.featureGroup] || []).includes(feat) : false;
                    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                      "label",
                      {
                        className: `flex items-center gap-1.5 text-[11.5px] cursor-pointer ${!isView ? "opacity-40 pointer-events-none" : "text-neutral-700 font-medium"}`,
                        children: [
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                            "input",
                            {
                              type: "checkbox",
                              checked: isChecked,
                              onChange: () => handleFeatureToggle(mod.featureGroup, feat),
                              disabled: !isView,
                              className: "rounded text-brand focus:ring-brand"
                            }
                          ),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "capitalize", children: feat.replace("_", " ") })
                        ]
                      },
                      feat
                    );
                  }) }) })
                ] }, mod.sidebarKey);
              }) })
            ] }) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex justify-end gap-3 pt-3 border-t border-neutral-100", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_ui.Button, { type: "button", variant: "ghost", onClick: () => viewMode === "create" ? setViewMode("manage") : closeModal(), children: "Cancel" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_ui.Button, { type: "submit", loading: processing, children: viewMode === "create" ? "Create User" : "Save Changes" })
      ] })
    ] });
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react2.Head, { title: "User Management" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "p-5 lg:p-8 max-w-7xl mx-auto", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_ui.PageHeader,
          {
            title: "User Management",
            subtitle: isPIC ? "Manage project access for users in your company." : "Manage users, roles, and fine-grained permissions.",
            actions: canCreate && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "bg-neutral-100 p-1 rounded-lg flex gap-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  onClick: () => setViewMode("manage"),
                  className: `px-4 py-1.5 text-[13px] font-bold rounded-md transition-colors ${viewMode === "manage" ? "bg-white text-brand shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`,
                  children: "Manage Users"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "button",
                {
                  onClick: () => {
                    setViewMode("create");
                    setEditingUser(null);
                    setData({
                      username: "",
                      email: "",
                      password: "",
                      roles_id: "",
                      companies_id: "",
                      divisions_id: "",
                      permission_matrix: { sidebar: [], features: {}, data_scope: "own_company", project_access: {} }
                    });
                  },
                  className: `px-4 py-1.5 text-[13px] font-bold rounded-md transition-colors flex items-center gap-1.5 ${viewMode === "create" ? "bg-white text-brand shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Plus, { size: 14 }),
                    " Create User"
                  ]
                }
              )
            ] })
          }
        ),
        viewMode === "manage" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_ui.Card, { className: "overflow-hidden", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "p-4 bg-white border-b border-neutral-200 flex flex-wrap gap-4", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex-1 min-w-[200px]", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1", children: "Filter by Role" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { value: filterRole, onChange: (e) => setFilterRole(e.target.value), className: "w-full border border-neutral-200 rounded-md px-3 py-1.5 text-[13px] focus:ring-1 focus:ring-brand focus:border-brand", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "All Roles" }),
                roles.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: r.name, children: r.name }, r.id))
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex-1 min-w-[200px]", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1", children: "Filter by Company" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { value: filterCompany, onChange: (e) => setFilterCompany(e.target.value), className: "w-full border border-neutral-200 rounded-md px-3 py-1.5 text-[13px] focus:ring-1 focus:ring-brand focus:border-brand", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "All Companies" }),
                companies.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: c.id, children: c.name }, c.id))
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex-1 min-w-[200px]", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1", children: "Filter by Division" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { value: filterDivision, onChange: (e) => setFilterDivision(e.target.value), className: "w-full border border-neutral-200 rounded-md px-3 py-1.5 text-[13px] focus:ring-1 focus:ring-brand focus:border-brand", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "All Divisions" }),
                divisions.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: d.id, children: d.divisi }, d.id))
              ] })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "overflow-x-auto", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "w-full text-left text-[13px]", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { className: "bg-neutral-50/80 text-neutral-500 font-semibold uppercase text-[11px] tracking-wider border-b border-neutral-200", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-5 py-3", children: "User" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-5 py-3", children: "Role" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-5 py-3", children: "Company" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-5 py-3", children: "Division" }),
              (canEditAny || isPIC || isSuperAdmin) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-5 py-3 text-right", children: "Actions" })
            ] }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tbody", { className: "divide-y divide-neutral-100", children: [
              filteredUsers.map((u) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { className: "hover:bg-neutral-50/50 transition-colors", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { className: "px-5 py-3", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "font-bold text-neutral-900", children: u.username }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "text-[11px] text-neutral-500", children: u.email })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-5 py-3", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "inline-flex px-2 py-0.5 bg-brand-light text-brand rounded font-semibold text-[11px]", children: u.role?.name || "N/A" }) }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-5 py-3 text-neutral-600", children: u.company?.name || "\u2014" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-5 py-3 text-neutral-600", children: u.division?.divisi || "\u2014" }),
                (canEditAny || isPIC || isSuperAdmin) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-5 py-3 text-right", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center justify-end gap-2", children: [
                  (isSuperAdmin || isPIC && u.role?.name === "worker" && u.companies_id === currentUser.companies_id) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => openModal(u), className: "p-1.5 text-neutral-400 hover:text-brand hover:bg-brand-light rounded transition-colors", title: isPIC && !canEditAny ? "Edit Project Access" : "Edit User", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Edit2, { size: 15 }) }),
                  isSuperAdmin && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => handleDelete(u.id), className: "p-1.5 text-neutral-400 hover:text-danger hover:bg-danger-light rounded transition-colors", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Trash2, { size: 15 }) })
                ] }) })
              ] }, u.id)),
              filteredUsers.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { colSpan: 5, className: "px-5 py-8 text-center text-neutral-500", children: "No users found." }) })
            ] })
          ] }) })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_ui.Card, { className: "p-6", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mb-6 pb-4 border-b border-neutral-100", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: "text-lg font-bold text-neutral-900", children: "Create New User" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-neutral-500 text-[13px]", children: "Fill in the details below to create a new user account." })
          ] }),
          renderForm()
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_ui.Modal, { isOpen: modalOpen, onClose: closeModal, title: isPIC ? `Manage Project Access: ${editingUser?.username}` : "Edit User", size: "lg", children: renderForm() }),
      toast && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_ui.Toast, { message: toast.msg, type: toast.type, onClose: () => setToast(null) })
    ] });
  }
})();
