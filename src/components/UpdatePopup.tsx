import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';

interface UpdatePopupProps {
  visible: boolean;
  latestVersion: string;
  apkUrl: string;
  onUpdate: () => void;
  onCancel: () => void;
  downloading: boolean;
  downloadProgress: number;
}

export const UpdatePopup: React.FC<UpdatePopupProps> = ({
  visible,
  latestVersion,
  apkUrl,
  onUpdate,
  onCancel,
  downloading,
  downloadProgress,
}) => {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.closeButton} onPress={onCancel}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>

        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>⬇️</Text>
        </View>

        <Text style={styles.title}>Update Available</Text>
        <Text style={styles.versionText}>Version {latestVersion}</Text>

        <Text style={styles.message}>
          A new version of the app is available. Would you like to update now?
        </Text>

        {downloading ? (
          <View style={styles.progressContainer}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.progressText}>
              Downloading... {Math.round(downloadProgress)}%
            </Text>
          </View>
        ) : (
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.updateButton} onPress={onUpdate}>
              <Text style={styles.updateButtonText}>Update Now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 400,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 4,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#666',
    fontWeight: 'bold',
  },
  iconContainer: {
    marginBottom: 16,
  },
  iconText: {
    fontSize: 48,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  versionText: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 16,
  },
  message: {
    fontSize: 14,
    color: '#4b5563',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  updateButton: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  updateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#4b5563',
    fontSize: 16,
    fontWeight: '600',
  },
  progressContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  progressText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
});
