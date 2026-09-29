import React, { useState, useMemo, useCallback } from 'react';
import { usePage, router, Link } from '@inertiajs/react';
import { ArrowLeft, Save, Plus, Edit2, Trash2, LayoutList, GitMerge } from 'lucide-react';
import { PageHeader, Card, Button, Modal } from '@/components/ui';
import { ReactFlow, Controls, Background, MiniMap, addEdge, applyNodeChanges, applyEdgeChanges, MarkerType, Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// Custom Task Node to show handles and better UI
const TaskNode = ({ data }: any) => {
  return (
    <div className="p-2 w-48 text-left bg-white rounded-lg shadow-sm border border-neutral-200">
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-blue-500 border-2 border-white" />
      <div className="text-[11px] font-bold text-brand mb-1">{data.code}</div>
      <div className="text-[13px] font-medium text-neutral-800 line-clamp-2">{data.name}</div>
      <div className="text-[10px] text-neutral-500 mt-2 flex justify-between">
        <span>{data.start}</span>
        <span>-</span>
        <span>{data.end}</span>
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-500 border-2 border-white" />
    </div>
  );
};

const nodeTypes = { taskNode: TaskNode };

export default function PredecessorManagerPage() {
  const { project } = usePage().props as any;
  const [activeTab, setActiveTab] = useState<'table' | 'diagram'>('diagram');

  // Flatten the tree into a list of tasks for the table view
  const tableData = useMemo(() => {
    const rows: any[] = [];
    project?.mainWbs?.forEach((main: any) => {
      rows.push({ type: 'main', id: main.id, code: main.code, name: main.name, start: main.start, end: main.end, isParent: true });
      main.subWbs?.forEach((sub: any) => {
        rows.push({ type: 'sub', id: sub.id, code: sub.code, name: sub.name, start: sub.start, end: sub.end, isParent: true });
        sub.wbsTasks?.forEach((task: any) => {
          rows.push({ type: 'task', id: task.id, code: task.code, name: task.name, start: task.start, end: task.end, duration: task.duration_days, dependencies: task.dependencies || [], isParent: false, taskId: task.id, subId: sub.id, mainId: main.id });
        });
      });
    });
    return rows;
  }, [project]);

  const [editingRow, setEditingRow] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', start: '', end: '' });

  const handleEdit = (row: any) => {
    setEditingRow(row);
    setFormData({ name: row.name, start: row.start ? row.start.slice(0, 10) : '', end: row.end ? row.end.slice(0, 10) : '' });
  };

  const handleSave = () => {
    if (!editingRow) return;
    let url = '';
    if (editingRow.type === 'main') url = `/projects/${project.id}/main-wbs/${editingRow.id}`;
    if (editingRow.type === 'sub') url = `/projects/${project.id}/sub-wbs/${editingRow.id}`;
    if (editingRow.type === 'task') url = `/projects/${project.id}/tasks/${editingRow.id}`;

    router.put(url, formData, {
      onSuccess: () => setEditingRow(null),
    });
  };

  // --- React Flow Diagram State ---
  const initialNodes = useMemo(() => {
    const tasks = tableData.filter(t => t.type === 'task');
    return tasks.map((t, idx) => ({
      id: String(t.id),
      type: 'taskNode',
      position: { x: (idx % 4) * 300, y: Math.floor(idx / 4) * 150 },
      data: { 
        code: t.code,
        name: t.name,
        start: t.start ? new Date(t.start).toLocaleDateString('id-ID') : '-',
        end: t.end ? new Date(t.end).toLocaleDateString('id-ID') : '-'
      }
    }));
  }, [tableData]);

  const initialEdges = useMemo(() => {
    const tasks = tableData.filter(t => t.type === 'task');
    return tasks.flatMap(t => 
      (t.dependencies || []).map((dep: any) => ({
        id: `e${dep.predecessor_wbs_id}-${t.id}`,
        source: String(dep.predecessor_wbs_id),
        target: String(t.id),
        label: dep.dependency_type,
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
        style: { stroke: '#3b82f6', strokeWidth: 2, cursor: 'pointer' },
        data: { depId: dep.id, taskId: t.id, depType: dep.dependency_type }
      }))
    );
  }, [tableData]);

  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);

  const onNodesChange = useCallback((changes: any) => setNodes((nds: any) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: any) => setEdges((eds: any) => applyEdgeChanges(changes, eds)), []);

  const onConnect = useCallback((params: any) => {
    const { source, target } = params;
    router.post(`/projects/${project.id}/tasks/${target}/dependencies`, {
      predecessor_wbs_ids: [source],
      dependency_type: 'FS',
      lag_days: 0,
    }, {
      preserveScroll: true,
      onSuccess: () => {
        // Just reload the page data to get the new dependency ID from backend
        router.reload({ only: ['project'] });
      }
    });
  }, [project.id]);

  // Edge editing
  const [edgeModal, setEdgeModal] = useState<any>(null);

  const onEdgeClick = useCallback((event: any, edge: any) => {
    event.stopPropagation();
    setEdgeModal(edge);
  }, []);

  const handleDeleteDependency = () => {
    if (!edgeModal?.data) return;
    const { taskId, depId } = edgeModal.data;
    router.delete(`/projects/${project.id}/tasks/${taskId}/dependencies/${depId}`, {
      preserveScroll: true,
      onSuccess: () => {
        setEdgeModal(null);
        router.reload({ only: ['project'] });
      }
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6 h-screen flex flex-col">
      <div>
        <Link href={`/projects/${project.id}/setup`} className="inline-flex items-center text-sm font-medium text-brand hover:text-brand-dark transition-colors mb-2">
          <ArrowLeft size={16} className="mr-1.5" /> Back to Project Setup
        </Link>
        <PageHeader 
          title={`Tree & Predecessor Manager: ${project.title}`} 
          subtitle="Manage tasks and their schedules."
        />
      </div>

      <div className="flex gap-2 mb-4 border-b border-neutral-200 pb-4">
        <Button 
          variant={activeTab === 'diagram' ? 'primary' : 'outline'} 
          onClick={() => setActiveTab('diagram')}
        >
          <GitMerge size={16} className="mr-2" /> Diagram (Bagan) View
        </Button>
        <Button 
          variant={activeTab === 'table' ? 'primary' : 'outline'} 
          onClick={() => setActiveTab('table')}
        >
          <LayoutList size={16} className="mr-2" /> Table View
        </Button>
      </div>

      {activeTab === 'table' ? (
        <Card className="overflow-hidden flex-1">
          <div className="overflow-x-auto h-full">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-neutral-50 text-neutral-600 text-[13px] font-bold uppercase tracking-wider border-b border-neutral-200">
                  <th className="p-4 w-[120px]">Level / Code</th>
                  <th className="p-4">Name</th>
                  <th className="p-4 w-[130px]">Start Date</th>
                  <th className="p-4 w-[130px]">End Date</th>
                  <th className="p-4 w-[200px]">Predecessors</th>
                  <th className="p-4 w-[100px] text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {tableData.map((row, idx) => (
                  <tr key={`${row.type}-${row.id}-${idx}`} className={`hover:bg-neutral-50 transition-colors ${row.type === 'main' ? 'bg-brand/5' : row.type === 'sub' ? 'bg-neutral-50/50' : 'bg-white'}`}>
                    <td className="p-4 font-mono text-[13px] text-neutral-600 font-medium">
                      <div className="flex items-center gap-2">
                        {row.type === 'sub' && <div className="w-4 border-t border-neutral-300 ml-2"></div>}
                        {row.type === 'task' && <div className="w-8 border-t border-neutral-300 ml-2"></div>}
                        <span className={row.type === 'main' ? 'font-bold text-brand' : ''}>{row.code}</span>
                      </div>
                    </td>
                    <td className={`p-4 text-[14px] ${row.type === 'main' ? 'font-bold text-neutral-900' : 'font-medium text-neutral-700'}`}>
                      {row.name}
                    </td>
                    <td className="p-4 text-[13px] text-neutral-600">
                      {row.start ? new Date(row.start).toLocaleDateString('id-ID') : '-'}
                    </td>
                    <td className="p-4 text-[13px] text-neutral-600">
                      {row.end ? new Date(row.end).toLocaleDateString('id-ID') : '-'}
                    </td>
                    <td className="p-4">
                      {row.type === 'task' ? (
                        <div className="flex flex-wrap gap-1">
                          {row.dependencies?.map((dep: any) => (
                            <span key={dep.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              {dep.predecessor?.code} ({dep.dependency_type})
                            </span>
                          ))}
                          {(!row.dependencies || row.dependencies.length === 0) && (
                            <span className="text-[12px] text-neutral-400 italic">None</span>
                          )}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-4 text-center">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(row)}>
                        <Edit2 size={14} className="text-neutral-500 hover:text-brand" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="flex-1 min-h-[600px] border-neutral-200 overflow-hidden relative">
          <ReactFlow 
            nodes={nodes} 
            edges={edges} 
            onNodesChange={onNodesChange} 
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            nodeTypes={nodeTypes}
            fitView
            attributionPosition="bottom-right"
          >
            <Background color="#ccc" gap={16} />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </Card>
      )}

      {/* Edit Node Modal */}
      <Modal isOpen={!!editingRow} onClose={() => setEditingRow(null)} title={`Edit ${editingRow?.type === 'main' ? 'Main WBS' : editingRow?.type === 'sub' ? 'Sub WBS' : 'Task'}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Name</label>
            <input type="text" className="w-full form-input" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Start Date</label>
              <input type="date" className="w-full form-input" value={formData.start} onChange={(e) => setFormData({...formData, start: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">End Date</label>
              <input type="date" className="w-full form-input" value={formData.end} onChange={(e) => setFormData({...formData, end: e.target.value})} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => setEditingRow(null)}>Cancel</Button>
            <Button variant="primary" onClick={handleSave}><Save size={16} className="mr-2" /> Save Changes</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Edge Modal */}
      <Modal isOpen={!!edgeModal} onClose={() => setEdgeModal(null)} title="Pengaturan Relasi">
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Relasi dari Task <b>{tableData.find(t => String(t.id) === edgeModal?.source)?.code}</b> ke Task <b>{tableData.find(t => String(t.id) === edgeModal?.target)?.code}</b> (Tipe: {edgeModal?.data?.depType}).
          </p>
          <div className="flex justify-between items-center mt-6 pt-4 border-t border-neutral-100">
            <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={handleDeleteDependency}>
              <Trash2 size={16} className="mr-2" /> Hapus Relasi
            </Button>
            <Button variant="primary" onClick={() => setEdgeModal(null)}>Tutup</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
