import { Router } from 'express';
import {
  getDevices,
  getDevice,
  heartbeat,
  updateConfig,
  sendCommand,
  deleteDevice,
  createDevice,
  updateDevice,
  getDeviceMedia,
  checkDeviceActivation,
  getDeviceStats,
  getDeviceConfigForDevice,
  reportDeviceHealth,
  reportCloudSyncStatus,
} from '../controllers/device.controller';
import { auth, adminOnly, deviceAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/stats', auth, getDeviceStats);
router.get('/', auth, getDevices);
router.get('/:id', auth, getDevice);
router.get('/:id/media', auth, getDeviceMedia);
router.get('/:id/activation', checkDeviceActivation);
router.get('/:id/cloud-config', deviceAuth, getDeviceConfigForDevice);
router.post('/', auth, createDevice);
router.post('/:id/heartbeat', deviceAuth, heartbeat);
router.post('/:id/health', deviceAuth, reportDeviceHealth);
router.post('/:id/sync-status', deviceAuth, reportCloudSyncStatus);
router.post('/:id/config', auth, updateConfig);
router.post('/:id/command', auth, sendCommand);
router.put('/:id', auth, adminOnly, updateDevice);
router.delete('/:id', auth, adminOnly, deleteDevice);

export default router;
