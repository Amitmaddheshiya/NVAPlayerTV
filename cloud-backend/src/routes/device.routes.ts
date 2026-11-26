import { Router } from 'express';
import {
  getDevices,
  getDevice,
  getDeviceConfigHistory,
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
  retryCloudSync,
  triggerEmergency,
  clearEmergency,
} from '../controllers/device.controller';
import { auth, adminOrDealer, deviceAuth } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/permission.middleware';

const router = Router();

router.get('/stats', auth, getDeviceStats);
router.get('/', auth, requirePermission('devices'), getDevices);
router.get('/:id', auth, requirePermission('devices'), getDevice);
router.get('/:id/media', auth, requirePermission('devices'), getDeviceMedia);
router.get('/:id/config-history', auth, requirePermission('devices'), getDeviceConfigHistory);
router.get('/:id/activation', checkDeviceActivation);
router.get('/:id/cloud-config', deviceAuth, getDeviceConfigForDevice);
router.post('/', auth, createDevice);
router.post('/:id/heartbeat', deviceAuth, heartbeat);
router.post('/:id/health', deviceAuth, reportDeviceHealth);
router.post('/:id/sync-status', deviceAuth, reportCloudSyncStatus);
router.post('/:id/config', auth, requirePermission('devices'), updateConfig);
router.post('/:id/emergency', auth, requirePermission('devices'), triggerEmergency);
router.post('/:id/emergency/clear', auth, requirePermission('devices'), clearEmergency);
router.post('/:id/retry-cloud-sync', auth, requirePermission('devices'), retryCloudSync);
router.post('/:id/command', auth, requirePermission('devices'), sendCommand);
router.put('/:id', auth, adminOrDealer, updateDevice);
router.delete('/:id', auth, adminOrDealer, deleteDevice);

export default router;
