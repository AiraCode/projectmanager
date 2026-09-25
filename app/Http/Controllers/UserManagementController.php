<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\Division;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;

class UserManagementController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        // Security check: Only SuperAdmin and PIC can access User Management
        if (!$user->hasSidebarAccess('User Management') && $user->role?->name !== 'SuperAdmin' && $user->role?->name !== 'pic') {
            abort(403, 'Unauthorized access.');
        }

        $query = User::with(['role', 'company', 'division']);

        // Data Scope: If not SuperAdmin (or data_scope != all), restrict to own company
        if ($user->getDataScope() !== 'all') {
            $query->where('companies_id', $user->companies_id);
        }

        $users = $query->get();
        $companies = Company::all();
        $divisions = Division::all();
        $roles = Role::all();
        
        $projects = [];
        if ($user->role?->name === 'pic') {
            $projects = \App\Models\Project::where('companies_id', $user->companies_id)
                ->select('id', 'title')
                ->get();
        }

        return Inertia::render('UserManagementPage', [
            'users' => $users,
            'companies' => $companies,
            'divisions' => $divisions,
            'roles' => $roles,
            'projects' => $projects,
            'currentUser' => $user->load(['role', 'company']),
        ]);
    }

    public function store(Request $request)
    {
        $user = $request->user();
        
        $request->validate([
            'username' => 'required|string|max:45',
            'email' => 'required|string|email|max:45|unique:users',
            'password' => 'required|string|min:6',
            'roles_id' => 'required|integer|exists:roles,id',
            'companies_id' => 'nullable|integer|exists:companies,id',
            'divisions_id' => 'nullable|integer|exists:divisions,id',
            'permission_matrix' => 'nullable|array',
        ]);

        $data = $request->only(['username', 'email', 'roles_id', 'companies_id', 'divisions_id', 'permission_matrix']);
        $data['password'] = Hash::make($request->password);

        // Security enforcement
        if ($user->role?->name === 'pic') {
            abort(403, 'Access Denied: PICs are not allowed to create users.');
        }

        $data['created_by'] = $user->id;
        $newUser = User::create($data);

        \App\Models\AuditLog::create([
            'user_id' => $user->id,
            'action' => 'CREATE_USER',
            'description' => "Created user {$newUser->username} ({$newUser->email})",
            'ip_address' => $request->ip(),
        ]);

        return redirect()->back()->with('success', 'User created successfully.');
    }

    public function update(Request $request, $id)
    {
        $user = $request->user();
        $targetUser = User::findOrFail($id);

        // Scope check for PIC
        if ($user->role?->name === 'pic') {
            if ($targetUser->companies_id !== $user->companies_id) {
                abort(403, 'Unauthorized to edit this user.');
            }
            
            // PIC can update project_access, sidebar, and features (except User Management)
            $request->validate([
                'permission_matrix' => 'nullable|array',
            ]);

            $currentMatrix = $targetUser->permission_matrix ?? [];
            $newMatrix = $request->permission_matrix ?? [];
            
            $currentMatrix['project_access'] = $newMatrix['project_access'] ?? [];
            
            // Handle sidebar (Module Access)
            $oldSidebar = $currentMatrix['sidebar'] ?? [];
            $hadUserMgmt = in_array('User Management', $oldSidebar);
            
            $newSidebar = $newMatrix['sidebar'] ?? [];
            $newSidebar = array_values(array_filter($newSidebar, function($item) {
                return $item !== 'User Management';
            }));
            
            if ($hadUserMgmt) {
                $newSidebar[] = 'User Management';
            }
            
            $currentMatrix['sidebar'] = $newSidebar;
            $currentMatrix['features'] = $newMatrix['features'] ?? [];
            
            $targetUser->update([
                'permission_matrix' => $currentMatrix,
                'last_modified_by' => $user->id
            ]);

            \App\Models\AuditLog::create([
                'user_id' => $user->id,
                'action' => 'UPDATE_PROJECT_ACCESS',
                'description' => "Updated project access for user {$targetUser->username}",
                'ip_address' => $request->ip(),
            ]);

            return redirect()->back()->with('success', 'Project access updated successfully.');
        }

        $request->validate([
            'username' => 'sometimes|required|string|max:45',
            'email' => 'sometimes|required|string|email|max:45|unique:users,email,' . $id,
            'password' => 'nullable|string|min:6',
            'roles_id' => 'sometimes|required|integer|exists:roles,id',
            'companies_id' => 'nullable|integer|exists:companies,id',
            'divisions_id' => 'nullable|integer|exists:divisions,id',
            'permission_matrix' => 'nullable|array',
        ]);

        $data = $request->only(['username', 'email', 'roles_id', 'companies_id', 'divisions_id', 'permission_matrix']);
        
        if ($request->filled('password')) {
            $data['password'] = Hash::make($request->password);
        }

        if ($user->role?->name === 'pic') {
            $data['companies_id'] = $user->companies_id; // Enforce
        }

        $data['last_modified_by'] = $user->id;
        $targetUser->update($data);

        \App\Models\AuditLog::create([
            'user_id' => $user->id,
            'action' => 'UPDATE_USER',
            'description' => "Updated user {$targetUser->username}",
            'ip_address' => $request->ip(),
        ]);

        return redirect()->back()->with('success', 'User updated successfully.');
    }

    public function destroy(Request $request, $id)
    {
        $user = $request->user();
        $targetUser = User::findOrFail($id);

        if ($user->role?->name === 'pic') {
            abort(403, 'Access Denied: PICs are not allowed to delete users.');
        }

        $targetUser->delete();

        \App\Models\AuditLog::create([
            'user_id' => $user->id,
            'action' => 'DELETE_USER',
            'description' => "Deleted user {$targetUser->username} ({$targetUser->email})",
            'ip_address' => $request->ip(),
        ]);

        return redirect()->back()->with('success', 'User deleted successfully.');
    }
}
