import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { scheduleAPI, deviceAPI, groupAPI, mediaAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { CloudConfigEditor, cloudConfigDefaults, getCloudSectionCount } from '../../components/CloudConfigEditor';
import { normalizeCloudOrientation } from '../../components/CloudOrientationPicker';
import { normalizeCloudGridRatio } from '../../components/CloudSectionRatioControl';
import {
  ArrowLeft, CalendarClock, Plus, Save, Trash2, Edit3, X, Check,
  Monitor, Layers, AlertTriangle,
} from 'lucide-react';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MODES = [
  { value: 'dayWise', label: 'Day-wise' },
  { value: 'dateWise', label: 'Date-wise' },
  { value: 'timeWise', label: 'Time-wise' },
];

const cloneConfig = (source: any) => {
  const base = source && typeof source === 'object' ? JSON.parse(JSON.stringify(source)) : {};
  delete base.schedule;
  delete base.configHistory;
  delete base.cacheInfo;
  return {
    ...cloudConfigDefaults,
    ...base,
    sections: Array.isArray(base.sections) && base.sections.length ? base.sections : cloudConfigDefaults.sections,
    ticker: { ...cloudConfigDefaults.ticker, ...(base.ticker || {}) },
    widgets: { ...cloudConfigDefaults.widgets, ...(base.widgets || {}) },
    cache: { ...cloudConfigDefaults.cache, ...(base.cache || {}) },
  };
};

const modeLabel = (mode: string) => mode === 'fullDay'
  ? 'Day-wise (legacy)'
  : MODES.find((m) => m.value === mode)?.label || mode;

const describeSchedule = (schedule: any) => {
  if (!schedule) return '';
  const parts: string[] = [];
  if (schedule.mode === 'dayWise') {
    const days = Array.isArray(schedule.days) && schedule.days.length ? schedule.days.map((d: number) => DAY_NAMES[d]).join(', ') : 'Every day';
    parts.push(days);
  }
  if (schedule.mode === 'dateWise') {
    parts.push(`${(schedule.dates || []).length} date(s)`);
  }
  if (schedule.startTime && schedule.endTime) {
    parts.push(`${schedule.startTime} - ${schedule.endTime}`);
  }
  if (schedule.mode === 'fullDay') parts.push('Every day (saved legacy rule)');
  return parts.join(' · ');
};

export default function UserSchedules() {
  const { deviceId, groupId } = useParams<{ deviceId?: string; groupId?: string }>();
  const navigate = useNavigate();
  const targetType = deviceId ? 'device' : 'group';
  const targetId = deviceId || groupId || '';

  const [targetName, setTargetName] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState({ name: '', enabled: true, mode: 'dayWise', days: [] as number[], dates: [] as string[], startTime: '', endTime: '' });
  const [config, setConfig] = useState<any>(cloneConfig(null));
  const [dateInput, setDateInput] = useState('');

  const backPath = deviceId ? `/user/devices/${deviceId}` : `/user/groups/${groupId}/configure`;

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const [tplRes, mediaRes] = await Promise.all([
        scheduleAPI.getSchedules({ targetType: targetType as any, targetId }),
        mediaAPI.getMedia({ page: 1, limit: 1000 }),
      ]);
      setTemplates(tplRes.data?.data || tplRes.data || []);
      setMediaList(mediaRes.data?.data || mediaRes.data || []);

      if (deviceId) {
        const deviceRes = await deviceAPI.getDevice(deviceId);
        const device = deviceRes.data;
        setTargetName(device?.name || deviceId);
      } else if (groupId) {
        const groupRes = await groupAPI.getGroup(groupId);
        const group = groupRes.data;
        setTargetName(group?.name || groupId);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [deviceId, groupId]);

  const startNew = async () => {
    setIsNew(true);
    setEditingId(null);
    setForm({ name: '', enabled: true, mode: 'dayWise', days: [], dates: [], startTime: '', endTime: '' });
    // Pre-fill from the target's current config so users start from what plays now.
    try {
      if (deviceId) {
        const res = await deviceAPI.getDevice(deviceId);
        setConfig(cloneConfig(res.data?.config));
      } else if (groupId) {
        const groupRes = await groupAPI.getGroup(groupId);
        const group = groupRes.data;
        let baseConfig = group?.config;
        if ((!baseConfig || !baseConfig.sections) && Array.isArray(group?.devices) && group.devices.length) {
          try {
            const firstDeviceId = typeof group.devices[0] === 'string' ? group.devices[0] : group.devices[0]?.deviceId;
            if (firstDeviceId) {
              const deviceRes = await deviceAPI.getDevice(firstDeviceId);
              baseConfig = deviceRes.data?.config || baseConfig;
            }
          } catch { /* keep group config */ }
        }
        setConfig(cloneConfig(baseConfig));
      }
    } catch {
      setConfig(cloneConfig(null));
    }
  };

  const startEdit = (template: any) => {
    setIsNew(false);
    setEditingId(template._id);
    setForm({
      name: template.name || '',
      enabled: template.enabled !== false,
      mode: template.schedule?.mode === 'fullDay' ? 'dayWise' : (template.schedule?.mode || 'dayWise'),
      days: template.schedule?.mode === 'fullDay'
        ? [0, 1, 2, 3, 4, 5, 6]
        : (Array.isArray(template.schedule?.days) ? template.schedule.days : []),
      dates: Array.isArray(template.schedule?.dates) ? template.schedule.dates : [],
      startTime: template.schedule?.startTime || '',
      endTime: template.schedule?.endTime || '',
    });
    setConfig(cloneConfig(template.config));
  };

  const cancelEdit = () => {
    setIsNew(false);
    setEditingId(null);
  };

  const addDate = () => {
    const value = dateInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    if (!form.dates.includes(value)) setForm({ ...form, dates: [...form.dates, value].sort() });
    setDateInput('');
  };

  const toggleDay = (day: number) => {
    setForm({
      ...form,
      days: form.days.includes(day) ? form.days.filter((d) => d !== day) : [...form.days, day].sort(),
    });
  };

  const buildConfigToSave = () => {
    const sectionCount = getCloudSectionCount(config.layout);
    let sectionsToSave = (config.sections || []).slice(0, sectionCount);
    if (!sectionsToSave.length) {
      sectionsToSave = cloudConfigDefaults.sections.slice(0, sectionCount);
    }
    sectionsToSave = sectionsToSave.map((section: any) => {
      const cleaned: any = { ...section };
      if (cleaned.contentType === 'multimedia') {
        cleaned.webUrl = '';
        cleaned.youtubeUrl = '';
      } else if (cleaned.contentType === 'web') {
        cleaned.mediaUrls = [];
        cleaned.youtubeUrl = '';
      } else if (cleaned.contentType === 'youtube') {
        cleaned.mediaUrls = [];
        cleaned.webUrl = '';
      }
      return cleaned;
    });
    return {
      ...config,
      orientation: normalizeCloudOrientation(config.orientation),
      gridRatio: normalizeCloudGridRatio(config.layout, config.grid3Layout, config.gridRatio),
      ticker: { ...(config.ticker || {}), fontSize: Math.min(100, Math.max(10, Number(config.ticker?.fontSize) || 24)) },
      sections: sectionsToSave,
    };
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('Template name is required');
      return;
    }
    if (form.mode === 'dayWise' && !form.days.length) {
      setError('Select at least one day for day-wise schedule');
      return;
    }
    if (form.mode === 'dateWise' && !form.dates.length) {
      setError('Add at least one date for date-wise schedule');
      return;
    }
    if (form.mode === 'timeWise' && (!form.startTime || !form.endTime)) {
      setError('Start and end time are required for time-wise schedule');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const payload = {
        name: form.name.trim(),
        targetType,
        targetId,
        enabled: form.enabled,
        schedule: {
          mode: form.mode,
          days: form.mode === 'dayWise' ? form.days : [],
          dates: form.mode === 'dateWise' ? form.dates : [],
          startTime: form.startTime || undefined,
          endTime: form.endTime || undefined,
        },
        config: buildConfigToSave(),
      };
      if (editingId) {
        await scheduleAPI.updateSchedule(editingId, payload);
      } else {
        await scheduleAPI.createSchedule(payload);
      }
      cancelEdit();
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save schedule template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (template: any) => {
    if (!window.confirm(`Delete schedule "${template.name}"? Devices will fall back to the normal configuration outside other schedules.`)) return;
    try {
      await scheduleAPI.deleteSchedule(template._id);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete schedule template');
    }
  };

  const handleToggleEnabled = async (template: any) => {
    try {
      await scheduleAPI.updateSchedule(template._id, { enabled: !template.enabled });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update schedule template');
    }
  };

  const editing = isNew || editingId !== null;

  if (loading) {
    return <div className="p-6 text-slate-500">Loading schedules...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-[95vw] sm:max-w-[1120px] xl:max-w-none xl:w-full mx-auto px-2 sm:px-3 xl:px-6 py-1.5 sm:py-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1.5 sm:gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="secondary" onClick={() => navigate(backPath)} className="text-[10px] sm:text-xs">
              <ArrowLeft className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
              <span className="hidden sm:inline">Back</span>
              <span className="sm:hidden">←</span>
            </Button>
            <div>
              <h1 className="text-sm sm:text-base md:text-lg font-bold text-gray-900 flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-blue-600" /> Scheduling
              </h1>
              <p className="text-[10px] sm:text-xs text-gray-500">
                {targetType === 'device' ? <Monitor className="inline h-3 w-3 mr-1" /> : <Layers className="inline h-3 w-3 mr-1" />}
                {targetName} · {templates.length} template{templates.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          {!editing && (
            <Button onClick={() => void startNew()} className="text-[10px] sm:text-xs">
              <Plus className="mr-1 h-3 w-3" /> New Template
            </Button>
          )}
        </div>
      </header>

      {error && (
        <div className="max-w-[95vw] sm:max-w-[1120px] xl:max-w-none xl:w-full mx-auto px-2 sm:px-3 xl:px-6 pt-2">
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" /> {error}
            <button className="ml-auto" onClick={() => setError('')}><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <main className="max-w-[95vw] sm:max-w-[1120px] xl:max-w-none xl:w-full mx-auto px-2 sm:px-3 xl:px-6 py-2 sm:py-3">
        {/* Schedule rule card (only while editing) */}
        {editing && (
          <Card className="mb-2 sm:mb-3">
            <CardHeader className="p-3 sm:p-4">
              <CardTitle className="text-[10px] sm:text-xs md:text-sm">
                {isNew ? 'New Schedule Template' : `Edit: ${form.name || 'template'}`}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Template name</label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Morning Menu" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Schedule mode</label>
                  <Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} options={MODES} />
                </div>
              </div>

              {form.mode === 'dayWise' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Days</label>
                  <div className="flex flex-wrap gap-2">
                    {DAY_NAMES.map((name, day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${form.days.includes(day) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {form.mode === 'dateWise' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Dates</label>
                  <div className="flex gap-2">
                    <Input type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
                    <Button variant="secondary" onClick={addDate} disabled={!dateInput}><Plus className="h-4 w-4" /></Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {form.dates.map((date) => (
                      <span key={date} className="flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">
                        {date}
                        <button type="button" onClick={() => setForm({ ...form, dates: form.dates.filter((d) => d !== date) })}><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                    {form.dates.length === 0 && <span className="text-xs text-slate-400">No dates added</span>}
                  </div>
                </div>
              )}

              {(form.mode === 'timeWise' || form.mode === 'dayWise' || form.mode === 'dateWise') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Start time {form.mode !== 'timeWise' && <span className="text-slate-400">(optional)</span>}</label>
                    <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">End time {form.mode !== 'timeWise' && <span className="text-slate-400">(optional)</span>}</label>
                    <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                  </div>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="h-4 w-4" />
                Enabled
              </label>

              <div className="flex justify-end gap-2 border-t pt-3">
                <Button variant="secondary" onClick={cancelEdit} disabled={saving}>Cancel</Button>
                <Button onClick={() => void handleSave()} disabled={saving}>
                  <Save className="mr-1 h-4 w-4" /> {saving ? 'Saving...' : editingId ? 'Update Template' : 'Create Template'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Template list */}
        {!editing && templates.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-slate-500">
              No schedule templates yet. Create one to switch this {targetType === 'device' ? 'device' : 'group'} between different configurations by time, day or date.
            </CardContent>
          </Card>
        )}
        {!editing && templates.map((template) => (
          <Card key={template._id} className={`mb-2 sm:mb-3 ${!template.enabled ? 'opacity-60' : ''}`}>
            <CardContent className="flex items-center justify-between gap-3 p-3 sm:p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-sm">{template.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${template.enabled ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                    {template.enabled ? 'Active' : 'Off'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {modeLabel(template.schedule?.mode)}{describeSchedule(template.schedule) ? ` · ${describeSchedule(template.schedule)}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="secondary" size="sm" onClick={() => handleToggleEnabled(template)} title={template.enabled ? 'Disable' : 'Enable'}>
                  {template.enabled ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-slate-400" />}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => startEdit(template)}><Edit3 className="h-4 w-4" /></Button>
                <Button variant="secondary" size="sm" onClick={() => void handleDelete(template)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Full config editor (same as device page) */}
        {editing && (
          <CloudConfigEditor
            config={config}
            setConfig={setConfig}
            mediaList={mediaList}
          />
        )}
      </main>
    </div>
  );
}
