<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Division;
use Illuminate\Http\Request;

class DivisionController extends Controller
{
    public function store(Request $request)
    {
        $request->validate(['divisi' => 'required|string|max:255|unique:divisions,divisi']);
        $division = Division::create(['divisi' => $request->divisi]);

        AuditLog::record('CREATE_DIVISION', "Created division '{$division->divisi}' (ID #{$division->id}).");

        return back()->with('success', 'Division created successfully.');
    }

    public function update(Request $request, $id)
    {
        $division = Division::findOrFail($id);
        $oldDivisi = $division->divisi;
        $request->validate(['divisi' => 'required|string|max:255|unique:divisions,divisi,' . $id]);
        $division->update(['divisi' => $request->divisi]);

        AuditLog::record('UPDATE_DIVISION', "Updated division #{$id} name from '{$oldDivisi}' to '{$division->divisi}'.");

        return back()->with('success', 'Division updated successfully.');
    }

    public function destroy($id)
    {
        $division = Division::findOrFail($id);
        // Only delete if no users are attached
        if ($division->users()->count() > 0) {
            return back()->with('error', 'Cannot delete division with existing users.');
        }
        $divName = $division->divisi;
        $division->delete();

        AuditLog::record('DELETE_DIVISION', "Deleted division '{$divName}' (ID #{$id}).");

        return back()->with('success', 'Division deleted successfully.');
    }
}
