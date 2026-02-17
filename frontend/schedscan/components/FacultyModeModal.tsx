import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Briefcase, Shield, ArrowRight, X } from 'lucide-react-native';

interface FacultyModeModalProps {
  visible: boolean;
  onConfirm: () => Promise<void>;
  onDismiss: () => void;
}

/**
 * Modal shown when a faculty schedule is detected.
 * Asks the user to confirm switching to Faculty mode.
 *
 * Respects the adviser requirement: faculty role is only assigned
 * when a faculty schedule has been uploaded — never during signup.
 */
export default function FacultyModeModal({
  visible,
  onConfirm,
  onDismiss,
}: FacultyModeModalProps) {
  const [isActivating, setIsActivating] = useState(false);

  const handleConfirm = async () => {
    setIsActivating(true);
    try {
      await onConfirm();
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View className="flex-1 bg-black/60 justify-center items-center px-6">
        <View className="bg-white rounded-2xl p-6 w-full shadow-lg">
          {/* Icon */}
          <View className="items-center mb-4">
            <View className="bg-orange-100 p-4 rounded-full">
              <Briefcase size={40} color="#EA580C" />
            </View>
          </View>

          {/* Title */}
          <Text className="text-xl font-bold text-gray-900 text-center mb-2">
            Faculty Schedule Detected
          </Text>

          {/* Description */}
          <Text className="text-gray-500 text-center text-sm mb-6 leading-5">
            You've uploaded a faculty schedule. Switch to{' '}
            <Text className="font-semibold text-orange-600">Faculty Mode</Text>{' '}
            to unlock class management features — generate class codes, assign
            tasks, and track student progress.
          </Text>

          {/* Feature bullets */}
          <View className="bg-orange-50 rounded-xl p-4 mb-6">
            <FeatureRow icon="📋" text="Generate class codes for your subjects" />
            <FeatureRow icon="✅" text="Create & track student tasks" />
            <FeatureRow icon="👥" text="View enrolled students & completion stats" />
          </View>

          {/* Actions */}
          <View className="gap-3">
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={isActivating}
              className="bg-orange-500 py-3.5 rounded-xl flex-row items-center justify-center"
            >
              {isActivating ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Text className="text-white font-bold text-base mr-2">
                    Switch to Faculty Mode
                  </Text>
                  <ArrowRight size={18} color="#ffffff" />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onDismiss}
              disabled={isActivating}
              className="py-3 rounded-xl items-center"
            >
              <Text className="text-gray-400 font-medium text-sm">
                Not now
              </Text>
            </TouchableOpacity>
          </View>

          {/* Note */}
          <View className="flex-row items-center justify-center mt-3">
            <Shield size={12} color="#9CA3AF" />
            <Text className="text-gray-400 text-xs ml-1">
              You can always access this later from Settings
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Small helper row for the feature list */
function FeatureRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View className="flex-row items-center mb-2 last:mb-0">
      <Text className="text-base mr-3">{icon}</Text>
      <Text className="text-orange-800 text-sm flex-1">{text}</Text>
    </View>
  );
}
