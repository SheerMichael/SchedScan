import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Modal, StyleSheet,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '../../../context/AuthContext';
import {
  facultyTaskService,
} from '../../../services/facultyTaskService';
import {
  facultyRemarkService,
  FacultyRemark,
} from '../../../services/remarkService';

// ---- Static icon components (outside render to avoid re-creation) ----
const BackArrow = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2">
    <Path d="M19 12H6M12 5l-7 7 7 7" />
  </Svg>
);

const SendIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
    <Path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </Svg>
);

// ---- Shared shadow styles (static, not recreated per render) ----
const styles = StyleSheet.create({
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  lightShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
});

// ---- Remark card (outside component to avoid re-creation) ----
function RemarkCard({ remark, onPress }: { remark: FacultyRemark; onPress: () => void }) {
  const initial = (remark.student_name?.charAt(0) || '?').toUpperCase();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="bg-white rounded-2xl mb-3 overflow-hidden"
      style={styles.cardShadow}
    >
      <View className="p-4">
        <View className="flex-row items-center mb-2.5">
          <View className="w-9 h-9 rounded-full bg-orange-100 justify-center items-center mr-3">
            <Text className="text-sm font-bold text-orange-600">{initial}</Text>
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-gray-900 text-sm">{remark.student_name}</Text>
            <Text className="text-gray-400 text-xs">{remark.time_ago}</Text>
          </View>
          <View className="bg-gray-100 rounded-full px-2 py-1">
            <Text className="text-gray-400 text-xs">View</Text>
          </View>
        </View>
        <Text className="text-gray-700 text-sm leading-5" numberOfLines={3}>
          {remark.text}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ============================================
// Faculty Remarks Screen
// ============================================
// Accessible from Faculty Dashboard → "Student Remarks" button
// Allows faculty to:
//   • See enrolled students
//   • Select a student and write a remark
//   • View / edit / delete past remarks
// ============================================

export default function FacultyRemarksScreen() {
  const { user } = useAuth();
  const { subjectCode } = useLocalSearchParams<{ subjectCode: string }>();

  // State
  const [students, setStudents] = useState<{ student_id: number; student_name: string; student_email: string }[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<{ student_id: number; student_name: string } | null>(null);
  const [remarks, setRemarks] = useState<FacultyRemark[]>([]);
  const [remarkText, setRemarkText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterStudentId, setFilterStudentId] = useState<number | null>(null);

  // Detail modal state (tap-to-expand)
  const [viewingRemark, setViewingRemark] = useState<FacultyRemark | null>(null);

  // Edit modal state
  const [editingRemark, setEditingRemark] = useState<FacultyRemark | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    if (user?.user_type === 'faculty') {
      loadData();
    }
  }, [subjectCode, user?.user_type]);

  const loadData = useCallback(async () => {
    if (!subjectCode) return;
    setIsLoading(true);
    try {
      const [enrolledData, remarksData] = await Promise.all([
        facultyTaskService.getEnrolledStudents(subjectCode),
        facultyRemarkService.getRemarks(subjectCode),
      ]);
      const enrollments = enrolledData.enrollments ?? enrolledData;
      const studentList = enrollments.map((e: any) => ({
        student_id: e.student_id ?? e.id,
        student_name: e.student_name,
        student_email: e.student_email,
      }));
      setStudents(studentList);
      setRemarks(remarksData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [subjectCode]);

  const handleSubmitRemark = async () => {
    if (!selectedStudent || !remarkText.trim()) return;

    try {
      setIsSubmitting(true);
      const newRemark = await facultyRemarkService.createRemark({
        student_id: selectedStudent.student_id,
        subject_code: subjectCode!,
        text: remarkText.trim(),
      });
      setRemarks(prev => [newRemark, ...prev]);
      setRemarkText('');
      Alert.alert('Success', `Remark sent for ${selectedStudent.student_name}`);
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Failed to submit remark.';
      Alert.alert('Error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditRemark = async () => {
    if (!editingRemark || !editText.trim()) return;
    try {
      const updated = await facultyRemarkService.updateRemark(editingRemark.id, editText.trim());
      setRemarks(prev => prev.map(r => (r.id === updated.id ? updated : r)));
      // Also update the viewing modal if it's the same remark
      if (viewingRemark?.id === updated.id) {
        setViewingRemark(updated);
      }
      setEditingRemark(null);
      setEditText('');
    } catch (error) {
      Alert.alert('Error', 'Failed to update remark.');
    }
  };

  const handleDeleteRemark = (remark: FacultyRemark) => {
    Alert.alert('Delete Remark', 'Are you sure you want to delete this remark?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await facultyRemarkService.deleteRemark(remark.id);
            setRemarks(prev => prev.filter(r => r.id !== remark.id));
            setViewingRemark(null); // Close detail modal
          } catch (error) {
            Alert.alert('Error', 'Failed to delete remark.');
          }
        },
      },
    ]);
  };

  // Filter remarks by selected student
  const displayedRemarks = filterStudentId
    ? remarks.filter(r => r.student === filterStudentId)
    : remarks;

  // Guard: only faculty should access this screen
  if (user?.user_type !== 'faculty') {
    return (
      <View className="flex-1 justify-center items-center bg-white px-6">
        <Text className="text-lg font-bold text-gray-800 mb-2">Access Denied</Text>
        <Text className="text-gray-500 text-center mb-4">Only faculty can access student remarks.</Text>
        <TouchableOpacity onPress={() => router.back()} className="bg-orange-500 px-6 py-3 rounded-xl">
          <Text className="text-white font-bold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <ActivityIndicator size="large" color="#f97316" />
        <Text className="mt-4 text-gray-500">Loading remarks...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white px-5 pt-4 pb-3 border-b border-gray-100">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <BackArrow />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-lg font-bold text-gray-900">Student Remarks</Text>
            <View className="flex-row items-center mt-0.5">
              <View className="bg-orange-100 rounded-md px-2 py-0.5 mr-2">
                <Text className="text-orange-700 text-xs font-semibold">{subjectCode}</Text>
              </View>
              <Text className="text-gray-400 text-xs">{remarks.length} remark{remarks.length !== 1 ? 's' : ''}</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Student Selector */}
        <View className="px-5 mt-4">
          <Text className="font-semibold text-sm text-gray-500 mb-2 uppercase tracking-wider">Select Student</Text>
          {students.length === 0 ? (
            <View className="bg-white p-5 rounded-2xl border border-dashed border-gray-200 items-center">
              <Text className="text-gray-400 text-sm">No enrolled students yet.</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {students.map((s) => {
                const isSelected = selectedStudent?.student_id === s.student_id;
                return (
                  <TouchableOpacity
                    key={s.student_id}
                    onPress={() => {
                      setSelectedStudent({ student_id: s.student_id, student_name: s.student_name });
                      setFilterStudentId(s.student_id);
                    }}
                    className={`mr-2.5 px-4 py-3 rounded-xl border min-w-[110px] items-center ${isSelected
                      ? 'bg-orange-50 border-orange-300'
                      : 'bg-white border-gray-100'
                      }`}
                    style={!isSelected ? styles.lightShadow : undefined}
                  >
                    <View className={`w-10 h-10 rounded-full justify-center items-center mb-1.5 ${isSelected ? 'bg-orange-200' : 'bg-gray-100'
                      }`}>
                      <Text className={`text-base font-bold ${isSelected ? 'text-orange-700' : 'text-gray-500'
                        }`}>
                        {s.student_name?.charAt(0)?.toUpperCase() || '?'}
                      </Text>
                    </View>
                    <Text
                      className={`text-xs font-medium text-center ${isSelected ? 'text-orange-700' : 'text-gray-600'
                        }`}
                      numberOfLines={1}
                    >
                      {s.student_name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Show All / Filter toggle */}
          {filterStudentId && (
            <TouchableOpacity
              onPress={() => { setFilterStudentId(null); setSelectedStudent(null); }}
              className="mt-2.5 self-end"
            >
              <Text className="text-orange-500 text-xs font-semibold">Show all remarks</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Write Remark */}
        {selectedStudent && (
          <View className="px-5 mt-5">
            <Text className="font-semibold text-sm text-gray-500 mb-2 uppercase tracking-wider">
              New Remark for {selectedStudent.student_name}
            </Text>
            <View
              className="bg-white rounded-2xl overflow-hidden"
              style={styles.cardShadow}
            >
              <TextInput
                value={remarkText}
                onChangeText={setRemarkText}
                placeholder="Write a remark about this student's performance..."
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={3}
                className="text-sm text-gray-800 px-4 pt-4 pb-2 min-h-[90px]"
                textAlignVertical="top"
                editable={!isSubmitting}
              />
              <View className="px-4 pb-3 flex-row justify-between items-center">
                <Text className={`text-xs ${remarkText.length > 900 ? 'text-red-400' : 'text-gray-300'}`}>
                  {remarkText.length}/1000
                </Text>
                <TouchableOpacity
                  onPress={handleSubmitRemark}
                  disabled={isSubmitting || !remarkText.trim()}
                  className={`flex-row items-center px-5 py-2.5 rounded-xl ${isSubmitting || !remarkText.trim() ? 'bg-gray-200' : 'bg-orange-500'
                    }`}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <SendIcon />
                      <Text className={`font-semibold text-sm ml-1.5 ${!remarkText.trim() ? 'text-gray-400' : 'text-white'
                        }`}>Send</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Remarks List */}
        <View className="px-5 mt-6">
          <Text className="font-semibold text-sm text-gray-500 mb-3 uppercase tracking-wider">
            {filterStudentId ? `Remarks for ${selectedStudent?.student_name}` : 'All Remarks'}
            {' '}({displayedRemarks.length})
          </Text>

          {displayedRemarks.length === 0 ? (
            <View className="bg-white p-8 rounded-2xl border border-dashed border-gray-200 items-center">
              <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5">
                <Path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </Svg>
              <Text className="text-gray-400 mt-3 text-sm">No remarks yet.</Text>
              <Text className="text-gray-300 text-xs mt-1">Select a student above to get started.</Text>
            </View>
          ) : (
            displayedRemarks.map((remark) => (
              <RemarkCard key={remark.id} remark={remark} onPress={() => setViewingRemark(remark)} />
            ))
          )}
        </View>
      </ScrollView>

      {/* ---- Detail Modal (tap-to-expand) ---- */}
      <Modal visible={!!viewingRemark} transparent animationType="fade" onRequestClose={() => setViewingRemark(null)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl max-h-[75%]">
            {/* Modal handle */}
            <View className="items-center pt-3 pb-2">
              <View className="w-10 h-1 bg-gray-200 rounded-full" />
            </View>

            {viewingRemark && (
              <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: 30 }}>
                <View className="px-5 pb-4">
                  {/* Student info */}
                  <View className="flex-row items-center mb-4">
                    <View className="w-11 h-11 rounded-full bg-orange-100 justify-center items-center mr-3">
                      <Text className="text-base font-bold text-orange-600">
                        {(viewingRemark.student_name?.charAt(0) || '?').toUpperCase()}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-bold text-gray-900 text-base">{viewingRemark.student_name}</Text>
                      <View className="flex-row items-center mt-0.5">
                        <View className="bg-orange-100 rounded px-1.5 py-0.5 mr-2">
                          <Text className="text-orange-700 text-xs font-medium">{subjectCode}</Text>
                        </View>
                        <Text className="text-gray-400 text-xs">{viewingRemark.time_ago}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => setViewingRemark(null)}
                      className="p-2 bg-gray-100 rounded-full"
                    >
                      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5">
                        <Path d="M18 6L6 18M6 6l12 12" />
                      </Svg>
                    </TouchableOpacity>
                  </View>

                  {/* Divider */}
                  <View className="h-px bg-gray-100 mb-4" />

                  {/* Full remark text */}
                  <Text className="text-gray-800 text-base leading-6">{viewingRemark.text}</Text>

                  {/* Timestamp */}
                  <Text className="text-gray-400 text-xs mt-4">
                    {viewingRemark.created_at
                      ? new Date(viewingRemark.created_at).toLocaleString()
                      : viewingRemark.time_ago}
                  </Text>
                </View>

                {/* Action bar */}
                <View className="px-5 pt-3 border-t border-gray-100 flex-row gap-3">
                  <TouchableOpacity
                    onPress={() => {
                      setEditingRemark(viewingRemark);
                      setEditText(viewingRemark.text);
                    }}
                    className="flex-1 flex-row justify-center items-center py-3 bg-gray-100 rounded-xl"
                  >
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2">
                      <Path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                    </Svg>
                    <Text className="text-gray-700 font-semibold text-sm ml-1.5">Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteRemark(viewingRemark)}
                    className="flex-1 flex-row justify-center items-center py-3 bg-red-50 rounded-xl"
                  >
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                      <Path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </Svg>
                    <Text className="text-red-500 font-semibold text-sm ml-1.5">Delete</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ---- Edit Remark Modal ---- */}
      <Modal visible={!!editingRemark} transparent animationType="fade" onRequestClose={() => { setEditingRemark(null); setEditText(''); }}>
        <View className="flex-1 bg-black/50 justify-center items-center px-5">
          <View className="bg-white rounded-2xl p-5 w-full max-w-md">
            <Text className="text-lg font-bold text-gray-900 mb-1">Edit Remark</Text>
            <Text className="text-gray-400 text-xs mb-3">
              For {editingRemark?.student_name}
            </Text>
            <TextInput
              value={editText}
              onChangeText={setEditText}
              multiline
              numberOfLines={5}
              className="bg-gray-50 p-4 rounded-xl text-sm text-gray-800 min-h-[120px] border border-gray-100"
              textAlignVertical="top"
            />
            <View className="flex-row mt-4 gap-3">
              <TouchableOpacity
                onPress={() => { setEditingRemark(null); setEditText(''); }}
                className="flex-1 bg-gray-100 py-3 rounded-xl"
              >
                <Text className="text-gray-600 font-semibold text-center text-sm">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleEditRemark}
                disabled={!editText.trim()}
                className={`flex-1 py-3 rounded-xl ${!editText.trim() ? 'bg-gray-200' : 'bg-orange-500'}`}
              >
                <Text className={`font-bold text-center text-sm ${!editText.trim() ? 'text-gray-400' : 'text-white'}`}>
                  Save Changes
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
