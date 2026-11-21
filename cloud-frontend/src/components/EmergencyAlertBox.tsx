import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { deviceAPI, groupAPI, mediaAPI } from '../services/api';
import { connectSocket } from '../services/socket';
import { AlertTriangle, Upload, X, FileImage, FileVideo, ShieldOff } from 'lucide-react';

interface EmergencyAlertBoxProps {
  mode: 'device' | 'group';
  targetId: string;
  targetLabel?: string;
  activeAlert?: any | null;
  onStatusChange?: () => void;
}

interface SelectedFile {
  url: string;
  mimeType: string;
  name: string;
}

const ALERT_TYPES = [
  { value: 'GENERAL', label: 'General' },
  { value: 'FIRE', label: 'Fire' },
  { value: 'EVACUATION', label: 'Evacuation' },
  { value: 'WEATHER', label: 'Weather' },
  { value: 'SECURITY', label: 'Security' },
  { value: 'OTHER', label: 'Other' },
];

export const EmergencyAlertBox = ({ mode, targetId, targetLabel, activeAlert, onStatusChange }: EmergencyAlertBoxProps) => {
  const [title, setTitle] = useState('EMERGENCY ALERT');
  const [type, setType] = useState('GENERAL');
  const [message, setMessage] = useState('');
  const [sound, setSound] = useState(false);
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isActive = !!activeAlert?.active;
  const scopeLabel = mode === 'group' ? 'all devices in this group' : (targetLabel || 'this TV');

  useEffect(() => {
    const sock = connectSocket();
    if (!sock) return;
    const handler = () => {
      onStatusChange?.();
    };
    sock.on('emergency:status', handler);
    return () => {
      sock.off('emergency:status', handler);
    };
  }, [onStatusChange]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;
    const mime = String(selected.type || '');
    const isImage = mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(selected.name);
    const isVideo = mime.startsWith('video/') || /\.(mp4|m4v|mov|mkv|webm|avi|3gp|mpg|mpeg)$/i.test(selected.name);
    if (!isImage && !isVideo) {
      setError('Only image or video files are allowed for emergency content.');
      return;
    }
    setError('');
    setNotice('');
    setUploading(true);
    try {
      const response = await mediaAPI.uploadMedia(selected, undefined, undefined, 'emergency');
      const media = response.data;
      const url = String(media?.url || '');
      if (!url) throw new Error('Upload finished but no media URL was returned');
      setFile({
        url,
        mimeType: String(media?.mimeType || mime || ''),
        name: String(media?.originalName || selected.name),
      });
      setNotice('File uploaded. Press Send to push it to the TV.');
    } catch (uploadError: any) {
      setError(uploadError?.response?.data?.error || uploadError?.message || 'File upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async () => {
    setError('');
    setNotice('');
    const trimmedMessage = message.trim();
    if (!file && !trimmedMessage) {
      setError('Write an alert message or attach an image/video file.');
      return;
    }
    setSending(true);
    try {
      const payload: any = {
        type,
        title: title.trim() || 'EMERGENCY ALERT',
        sound,
      };
      if (file) {
        payload.kind = 'media';
        payload.mediaUrl = file.url;
        payload.mediaType = file.mimeType;
        if (trimmedMessage) payload.message = trimmedMessage;
      } else {
        payload.kind = 'message';
        payload.message = trimmedMessage;
      }

      const response = mode === 'group'
        ? await groupAPI.triggerEmergency(targetId, payload)
        : await deviceAPI.triggerEmergency(targetId, payload);

      const data = response.data || {};
      setNotice(data.message || `Emergency alert sent to ${scopeLabel}.`);
      onStatusChange?.();
    } catch (sendError: any) {
      setError(sendError?.response?.data?.error || sendError?.message || 'Failed to send emergency alert');
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    setError('');
    setNotice('');
    setClearing(true);
    try {
      if (mode === 'group') {
        await groupAPI.clearEmergency(targetId);
      } else {
        await deviceAPI.clearEmergency(targetId);
      }
      setNotice(`Emergency alert cleared on ${scopeLabel}.`);
      onStatusChange?.();
    } catch (clearError: any) {
      setError(clearError?.response?.data?.error || clearError?.message || 'Failed to clear emergency alert');
    } finally {
      setClearing(false);
    }
  };

  const isImageFile = file ? (file.mimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)) : false;
  const FileIcon = isImageFile ? FileImage : FileVideo;

  return (
    <Card className="border-red-200">
      <CardHeader className="px-3 py-2 border-b-0">
        <CardTitle className="flex items-center gap-1.5 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4" />
          Emergency Content
        </CardTitle>
        <p className="text-[10px] text-gray-500 mt-0.5">
          Fullscreen alert on {scopeLabel} until rejected or cleared.
        </p>
      </CardHeader>
      <CardContent className="p-3 pt-1 space-y-2">
        {isActive && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 flex items-center justify-between gap-2">
            <span>
              <strong>Active on TV</strong>
              {activeAlert?.kind === 'media' ? ' · media' : ' · message'}
              {activeAlert?.triggeredAt ? ` · ${new Date(activeAlert.triggeredAt).toLocaleString()}` : ''}
            </span>
            <Button variant="danger" size="sm" onClick={handleClear} disabled={clearing}>
              <ShieldOff className="w-3.5 h-3.5 mr-1" />
              {clearing ? 'Clearing…' : 'Clear'}
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="EMERGENCY ALERT"
            maxLength={120}
            className="py-1 text-xs"
          />
          <Select
            label="Alert type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={ALERT_TYPES}
            className="py-1 text-xs"
          />
        </div>

        <div className="flex flex-col gap-0.5">
          <label className="text-xs font-medium text-gray-700">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Alert message for the TV…"
            className="px-2.5 py-1 text-xs rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full resize-y"
          />
        </div>

        <div className="flex flex-col gap-0.5">
          <label className="text-xs font-medium text-gray-700">Image / video (optional)</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleFileSelect}
          />
          {file ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs">
              <FileIcon className="w-4 h-4 text-gray-500 shrink-0" />
              <span className="truncate flex-1">{file.name}</span>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-gray-400 hover:text-red-600"
                title="Remove file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-fit"
            >
              <Upload className="w-4 h-4 mr-1" />
              {uploading ? 'Uploading…' : 'Choose file'}
            </Button>
          )}
          <span className="text-[10px] text-gray-400">Attached file shows fullscreen instead of message.</span>
        </div>

        <label className="flex items-center gap-1.5 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => setSound(e.target.checked)}
            className="rounded border-gray-300"
          />
          Siren sound on TV
        </label>

        {error && <p className="text-xs text-red-600">{error}</p>}
        {notice && <p className="text-xs text-emerald-600">{notice}</p>}

        <Button variant="danger" size="sm" onClick={handleSend} disabled={sending || uploading} className="w-full">
          {sending ? 'Sending…' : `Send to ${targetLabel || (mode === 'group' ? 'group' : 'TV')}`}
        </Button>
      </CardContent>
    </Card>
  );
};

export default EmergencyAlertBox;
