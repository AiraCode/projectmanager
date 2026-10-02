<?php

namespace App\Http\Controllers;

use App\Models\Division;
use Illuminate\Http\Request;

class DivisionController extends Controller
{
    public function store(Request $request)
    {
        $request->validate(['divisi' => 'required|string|max:255|unique:divisions,divisi']);
        Division::create(['divisi' => $request->divisi]);
        return back()->with('success', 'Division created successfully.');
    }

    public function update(Request $request, $id)
    {
        $division = Division::findOrFail($id);
        $request->validate(['divisi' => 'required|string|max:255|unique:divisions,divisi,' . $id]);
        $division->update(['divisi' => $request->divisi]);
        return back()->with('success', 'Division updated successfully.');
    }

    public function destroy($id)
    {
        $division = Division::findOrFail($id);
        // Only delete if no users are attached
        if ($division->users()->count() > 0) {
            return back()->with('error', 'Cannot delete division with existing users.');
        }
        $division->delete();
        return back()->with('success', 'Division deleted successfully.');
    }
}
