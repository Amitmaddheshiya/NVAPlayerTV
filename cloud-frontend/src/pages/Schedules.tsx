import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { scheduleAPI } from '../services/api';
import type { Schedule } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Plus, Trash2, Edit } from 'lucide-react';

export const Schedules = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    layout: 'fullscreen',
    fallbackMode: 'black' as 'black' | 'message' | 'image',
    fallbackMessage: '',
    fallbackImageUrl: '',
  });

  useEffect(() => {
    loadSchedules();
  }, []);

  const loadSchedules = async () => {
    try {
      const response = await scheduleAPI.getSchedules();
      setSchedules(response.data);
    } catch (error) {
      console.error('Failed to load schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      name: formData.name,
      profile: {
        layout: formData.layout,
        sections: [],
        ticker: { text: '', position: 'bottom', color: '#ffffff', speed: 6 },
      },
      slots: [],
      fallback: {
        mode: formData.fallbackMode,
        message: formData.fallbackMessage,
        imageUrl: formData.fallbackImageUrl,
      },
      assignedDevices: [],
    };

    try {
      if (editingSchedule) {
        await scheduleAPI.updateSchedule(editingSchedule._id, data);
      } else {
        await scheduleAPI.createSchedule(data);
      }
      setShowForm(false);
      setEditingSchedule(null);
      setFormData({
        name: '',
        layout: 'fullscreen',
        fallbackMode: 'black',
        fallbackMessage: '',
        fallbackImageUrl: '',
      });
      loadSchedules();
    } catch (error) {
      alert('Save failed');
    }
  };

  const handleEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setFormData({
      name: schedule.name,
      layout: schedule.profile.layout,
      fallbackMode: schedule.fallback.mode,
      fallbackMessage: schedule.fallback.message || '',
      fallbackImageUrl: schedule.fallback.imageUrl || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    try {
      await scheduleAPI.deleteSchedule(id);
      loadSchedules();
    } catch (error) {
      alert('Delete failed');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Schedules</h1>
          <div className="flex gap-2">
            <Button onClick={() => setShowForm(!showForm)}>
              <Plus className="w-4 h-4 mr-2" />
              New Schedule
            </Button>
            <Button variant="secondary" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {showForm && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{editingSchedule ? 'Edit Schedule' : 'Create Schedule'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Schedule Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
                <Select
                  label="Layout"
                  options={[
                    { value: 'fullscreen', label: 'Fullscreen' },
                    { value: 'grid2', label: 'Grid 2' },
                    { value: 'grid3', label: 'Grid 3' },
                  ]}
                  value={formData.layout}
                  onChange={(e) => setFormData({ ...formData, layout: e.target.value })}
                />
                <Select
                  label="Fallback Mode"
                  options={[
                    { value: 'black', label: 'Black Screen' },
                    { value: 'message', label: 'Custom Message' },
                    { value: 'image', label: 'Website URL' },
                  ]}
                  value={formData.fallbackMode}
                  onChange={(e) => setFormData({ ...formData, fallbackMode: e.target.value as any })}
                />
                {formData.fallbackMode === 'message' && (
                  <Input
                    label="Fallback Message"
                    value={formData.fallbackMessage}
                    onChange={(e) => setFormData({ ...formData, fallbackMessage: e.target.value })}
                  />
                )}
                {formData.fallbackMode === 'image' && (
                  <Input
                    label="Fallback Website URL"
                    value={formData.fallbackImageUrl}
                    onChange={(e) => setFormData({ ...formData, fallbackImageUrl: e.target.value })}
                  />
                )}
                <div className="flex gap-2">
                  <Button type="submit">
                    {editingSchedule ? 'Update' : 'Create'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setShowForm(false);
                      setEditingSchedule(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {schedules.map((schedule) => (
            <Card key={schedule._id}>
              <CardHeader>
                <CardTitle className="text-lg">{schedule.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <span className="text-gray-600">Layout:</span> {schedule.profile.layout}
                </div>
                <div className="text-sm">
                  <span className="text-gray-600">Slots:</span> {schedule.slots.length}
                </div>
                <div className="text-sm">
                  <span className="text-gray-600">Fallback:</span> {schedule.fallback.mode}
                </div>
                <div className="text-sm text-gray-500">
                  Created: {new Date(schedule.createdAt).toLocaleDateString()}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleEdit(schedule)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleDelete(schedule._id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
};
