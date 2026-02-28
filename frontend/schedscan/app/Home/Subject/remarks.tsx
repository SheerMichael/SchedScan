import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, FlatList, Modal,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '../../../context/AuthContext';
import {
  facultyTaskService,
  TaskCompletionStudent,
} from '../../../services/facultyTaskService';
import {
  facultyRemarkService,
  FacultyRemark,
} from '../../../services/remarkService';

// ============================================
// Faculty Remarks Screen
// ============================================
// Accessible from Subject Details → "Student Remarks" button
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

  // Edit modal state
  const [editingRemark, setEditingRemark] = useState<FacultyRemark | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    loadData();
  }, [subjectCode]);

  const loadData = useCallback(async () => {
    if (!subjectCode) return;
    setIsLoading(true);
    try {
      const [enrolledData, remarksData] = await Promise.all([
        facultyTaskService.getEnrolledStudents(subjectCode),
        facultyRemarkService.getRemarks(subjectCode),
      ]);
      // enrolled-students returns { enrollments: [...] } with student_name, student_email, student_id fields
      // from ClassEnrollmentSerializer (faculty_name, student_name, student_email are method fields)
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

  // Icons
  const BackArrow = () => (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2">
      <Path d="M19 12H6M12 5l-7 7 7 7" />
    </Svg>
  );

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#f97316" />
        <Text className="mt-4 text-gray-500">Loading...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white px-4 py-3 border-b border-gray-200 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <BackArrow />
        </TouchableOpacity>
        <View>
          <Text className="text-lg font-bold text-gray-800">Student Remarks</Text>
          <Text className="text-sm text-gray-500">{subjectCode}</Text>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Student Selector */}
        <View className="px-4 mt-4">
          <Text className="font-bold text-base text-gray-700 mb-2">Select a Student</Text>
          {students.length === 0 ? (
            <View className="bg-white p-4 rounded-xl border border-dashed border-gray-300 items-center">
              <Text className="text-gray-400">No enrolled students yet.</Text>
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
                    className={`mr-2 px-4 py-3 rounded-xl border min-w-[120px] items-center ${
                      isSelected ? 'bg-orange-50 border-orange-400' : 'bg-white border-gray-200'
                    }`}
                  >
                    <View className="w-10 h-10 rounded-full bg-orange-100 justify-center items-center mb-1">
                      <Text className="text-lg font-bold text-orange-600">
                        {s.student_name?.charAt(0) || '?'}
                      </Text>
                    </View>
                    <Text
                      className={`text-sm font-medium text-center ${
                        isSelected ? 'text-orange-700' : 'text-gray-700'
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
              className="mt-2 self-end"
            >
              <Text className="text-orange-500 text-sm font-medium">Show all remarks</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Write Remark */}
        {selectedStudent && (
          <View className="px-4 mt-4">
            <Text className="font-bold text-base text-gray-700 mb-2">
              Remark for {selectedStudent.student_name}
            </Text>
            <View className="bg-white p-3 rounded-xl shadow">
              <TextInput
                value={remarkText}
                onChangeText={setRemarkText}
                placeholder="Write a remark about this student's performance..."
                multiline
                numberOfLines={3}
                className="text-base text-gray-800 min-h-[80px]"
                textAlignVertical="top"
                editable={!isSubmitting}
              />
              <TouchableOpacity
                onPress={handleSubmitRemark}
                disabled={isSubmitting || !remarkText.trim()}
                className={`mt-2 py-3 rounded-xl items-center ${
                  isSubmitting || !remarkText.trim() ? 'bg-gray-300' : 'bg-orange-500'
                }`}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-white font-bold">Submit Remark</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Remarks List */}
        <View className="px-4 mt-6">
          <Text className="font-bold text-base text-gray-700 mb-3">
            {filterStudentId ? `Remarks for ${selectedStudent?.student_name}` : 'All Remarks'}
            {' '}({displayedRemarks.length})
          </Text>

          {displayedRemarks.length === 0 ? (
            <View className="bg-white p-6 rounded-xl border border-dashed border-gray-200 items-center">
              <Text className="text-gray-400">No remarks yet.</Text>
            </View>
          ) : (
            displayedRemarks.map((remark) => (
              <View
                key={remark.id}
                className="bg-white p-4 rounded-xl mb-3 shadow-sm border-l-4 border-orange-400"
              >
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 mr-2">
                    <Text className="font-semibold text-gray-800 text-sm mb-0.5">
                      {remark.student_name}
                    </Text>
                    <Text className="text-gray-700 text-base">{remark.text}</Text>
                    <Text className="text-gray-400 text-xs mt-1">{remark.time_ago}</Text>
                  </View>
                  <View className="flex-row">
                    <TouchableOpacity
                      onPress={() => { setEditingRemark(remark); setEditText(remark.text); }}
                      className="p-2"
                    >
                      <Text className="text-blue-500 text-xs font-medium">Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteRemark(remark)} className="p-2">
                      <Text className="text-red-500 text-xs font-medium">Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Edit Remark Modal */}
      <Modal visible={!!editingRemark} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-center items-center">
          <View className="bg-white rounded-2xl p-6 w-11/12 max-w-md">
            <Text className="text-lg font-bold text-gray-800 mb-3">Edit Remark</Text>
            <TextInput
              value={editText}
              onChangeText={setEditText}
              multiline
              numberOfLines={4}
              className="bg-gray-100 p-3 rounded-xl text-base text-gray-800 min-h-[100px]"
              textAlignVertical="top"
            />
            <View className="flex-row mt-4 gap-3">
              <TouchableOpacity
                onPress={() => { setEditingRemark(null); setEditText(''); }}
                className="flex-1 bg-gray-200 py-3 rounded-xl"
              >
                <Text className="text-gray-700 font-semibold text-center">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleEditRemark}
                disabled={!editText.trim()}
                className={`flex-1 py-3 rounded-xl ${!editText.trim() ? 'bg-gray-300' : 'bg-orange-500'}`}
              >
                <Text className="text-white font-bold text-center">Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
