import { View, Text, TouchableOpacity, Image, Alert, ActivityIndicator, Modal, TextInput, Dimensions, SafeAreaView } from "react-native";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import Svg, { Path } from 'react-native-svg';
import { Images, Files, GraduationCap, Briefcase, ArrowRight, AlertTriangle } from "lucide-react-native";
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { courseService, Course } from '../../services/courseService';
import { scheduleStorageService } from '../../services/scheduleStorageService';
import { useAuth } from '../../context/AuthContext';
import FacultyModeModal from '../../components/FacultyModeModal';
import { detectSemesterFromDate } from '../../utils/semesterUtils';

export default function Scanner() {
  const router = useRouter();
  const { user, activateFacultyMode, setPendingFacultyUnlock } = useAuth();

  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [selectedRole, setSelectedRole] = useState<'faculty' | 'student' | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [uploadedCourses, setUploadedCourses] = useState<Course[]>([]);
  const [uploadedSemester, setUploadedSemester] = useState<string>('');
  const [uploadedSchoolYear, setUploadedSchoolYear] = useState<string>('');
  const [reportModal, setReportModal] = useState(false);
  const [incidentDetails, setIncidentDetails] = useState('');
  const [uploadError, setUploadError] = useState('');

  // Faculty mode unlock modal
  const [showFacultyModeModal, setShowFacultyModeModal] = useState(false);

  // --- Logic Helpers (Rate Limit, Upload, Etc) ---

  const MAX_REPORT_LENGTH = 500;

  const handleSubmit = () => {
    const sanitizedDetails = incidentDetails.trim().slice(0, MAX_REPORT_LENGTH);
    if (!sanitizedDetails) return;

    const reportData = {
      originator: "SYSTEM ADMIN", 
      timestamp: new Date().toISOString().split('T')[0] + " " + new Date().toLocaleTimeString(),
      incidentDetails: sanitizedDetails,
      status: "PENDING",
    };

    console.log("Submitting:", reportData);
    dismissErrorModal();
    router.back();
  };

  const dismissErrorModal = () => {
    setReportModal(false);
    setUploadError('');
    setIncidentDetails('');
  };

  const checkRateLimit = async (): Promise<boolean> => {
    if (!user?.id) {
      Alert.alert('Error', 'User not authenticated');
      return false;
    }
    const { allowed, remainingSeconds } = await scheduleStorageService.canUpload(user.id);
    if (!allowed) {
      Alert.alert('Please Wait', `You can upload again in ${remainingSeconds} seconds.\n\nRate limit: 1 upload per minute.`);
      return false;
    }
    return true;
  };

  const handleRoleSelection = (role: 'faculty' | 'student') => {
    setSelectedRole(role);
  };

  const handleDocumentUpload = async () => {
    if (!selectedRole) { Alert.alert('Error', 'Please select a role first'); return; }
    if (!(await checkRateLimit())) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setSelectedFile({ uri: file.uri, name: file.name, mimeType: file.mimeType, size: file.size, uploadType: selectedRole });
        await uploadFile(file, selectedRole);
      }
    } catch (error) {
      setUploadError('Failed to pick document. Please try again.');
      setReportModal(true);
    }
  };

  const handleImageGallery = async () => {
    if (!selectedRole) { Alert.alert('Error', 'Please select a role first'); return; }
    if (!(await checkRateLimit())) return;

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8, // Reduced quality for faster upload while maintaining OCR readability
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const image = result.assets[0];
        setSelectedFile({ uri: image.uri, name: 'image.jpg', mimeType: 'image/jpeg', uploadType: selectedRole });
        await uploadFile(image, selectedRole);
      }
    } catch (error) { Alert.alert('Error', 'Failed to pick image'); }
  };

  const handleCameraCapture = async () => {
    if (!selectedRole) { Alert.alert('Error', 'Please select a role first'); return; }
    if (!(await checkRateLimit())) return;

    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your camera');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8, // Reduced quality for faster upload while maintaining OCR readability
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const image = result.assets[0];
        setSelectedFile({ uri: image.uri, name: 'camera-capture.jpg', mimeType: 'image/jpeg', uploadType: selectedRole });
        await uploadFile(image, selectedRole);
      }
    } catch (error) { Alert.alert('Error', 'Failed to capture image'); }
  };

  // Upload function to backend
  const uploadFile = async (file: any, uploadType: 'student' | 'faculty') => {
    setIsUploading(true);
    try {
      const response = await courseService.uploadCOR(file, uploadType);

      console.log('Upload successful:', response);

      // Record the upload timestamp for rate limiting
      if (user?.id) {
        await scheduleStorageService.recordUpload(user.id);
      }

      // Store courses
      setUploadedCourses(response.courses);

      // Capture semester data from extraction (student COR) or auto-detect (faculty)
      if (response.semester) {
        setUploadedSemester(response.semester);
        setUploadedSchoolYear(response.school_year || '');
      } else {
        // Faculty IDP or missing data — auto-detect from today's date
        const detected = detectSemesterFromDate();
        setUploadedSemester(detected.semester);
        setUploadedSchoolYear(detected.schoolYear);
      }

      setIsUploading(false);
      setShowTitleModal(true);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to upload file. Please try again.';
      setUploadError(errorMessage);
      setIsUploading(false);
      setReportModal(true);
    }
  };

  const saveScheduleOnly = async () => {
    if (!scheduleTitle.trim()) { Alert.alert('Error', 'Please enter a schedule title'); return; }
    if (!user?.id) { Alert.alert('Error', 'User not authenticated'); return; }
    try {
      await scheduleStorageService.saveSchedule(scheduleTitle.trim(), uploadedCourses, selectedRole!, user.id, false, uploadedSemester, uploadedSchoolYear);
      setShowTitleModal(false);

      // If this was a faculty schedule and user is not yet faculty, show unlock modal
      if (selectedRole === 'faculty' && user.user_type !== 'faculty') {
        setShowFacultyModeModal(true);
      } else {
        Alert.alert('Saved!', `Schedule "${scheduleTitle}" saved.`, [
          { text: 'OK', onPress: () => { resetScanner(); router.push(selectedRole === 'student' ? '/Home/Schedules/student' : '/Home/Schedules/faculty'); } }
        ]);
      }
    } catch (error) { Alert.alert('Error', 'Failed to save schedule.'); }
  };

  const saveAndApplyReminders = async () => {
    if (!scheduleTitle.trim()) { Alert.alert('Error', 'Please enter a schedule title'); return; }
    if (!user?.id) { Alert.alert('Error', 'User not authenticated'); return; }
    try {
      await scheduleStorageService.saveSchedule(scheduleTitle.trim(), uploadedCourses, selectedRole!, user.id, true, uploadedSemester, uploadedSchoolYear);
      setShowTitleModal(false);

      // If this was a faculty schedule and user is not yet faculty, show unlock modal
      if (selectedRole === 'faculty' && user.user_type !== 'faculty') {
        setShowFacultyModeModal(true);
      } else {
        Alert.alert('Success!', `Schedule "${scheduleTitle}" is now active!`, [
          { text: 'OK', onPress: () => { resetScanner(); router.replace('/Home/home'); } }
        ]);
      }
    } catch (error) { Alert.alert('Error', 'Failed to save schedule.'); }
  };

  const handleFacultyModeConfirm = async () => {
    const success = await activateFacultyMode();
    setShowFacultyModeModal(false);
    if (success) {
      Alert.alert(
        'Faculty Mode Activated! 🎉',
        'You now have access to class management features — generate class codes, assign tasks, and track student progress.',
        [{ text: 'View Faculty Schedules', onPress: () => { resetScanner(); router.push('/Home/Schedules/faculty'); } }]
      );
    } else {
      Alert.alert('Error', 'Failed to activate faculty mode. Please try again from Settings.');
      resetScanner();
      router.replace('/Home/home');
    }
  };

  const handleFacultyModeDismiss = () => {
    setShowFacultyModeModal(false);
    // Set pending flag so the banner appears on home screen
    setPendingFacultyUnlock(true);
    Alert.alert('Saved!', `Schedule "${scheduleTitle}" saved. You can switch to Faculty Mode anytime from your account settings.`, [
      { text: 'OK', onPress: () => { resetScanner(); router.replace('/Home/home'); } }
    ]);
  };

  const resetScanner = () => {
    setSelectedFile(null);
    setSelectedRole(null);
    setScheduleTitle('');
    setUploadedCourses([]);
    setUploadedSemester('');
    setUploadedSchoolYear('');
  };

  const LeftPointingArrow = ({ size = 24, color = '#ffffff' }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H6M12 5l-7 7 7 7" />
    </Svg>
  );

  return (
    <View className="flex-1 bg-[#B88080]">
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 pt-12 pb-4 z-20">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2 rounded-full bg-white/10">
          <LeftPointingArrow size={24} color="#ffffff" />
        </TouchableOpacity>

        <Text className="text-white text-lg font-bold tracking-wide">
          {!selectedRole ? "Select Role" : selectedFile ? "Preview" : "Scanner"}
        </Text>

        <View className="w-10" />
      </View>

      {/* Main Content Area */}
      <View className="flex-1 px-6">

        {!selectedRole ? (
          /* --- NEW ROLE SELECTION SCREEN --- */
          <View className="flex-1 justify-center pb-20">
            <Text className="text-white text-3xl font-bold mb-2">Welcome,</Text>
            <Text className="text-white/80 text-lg mb-8">Who is this schedule for?</Text>

            <View className="gap-4">
              {/* Student Card */}
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => handleRoleSelection('student')}
                className="bg-white rounded-2xl p-5 flex-row items-center shadow-sm"
              >
                <View className="bg-red-100 p-3 rounded-full mr-4">
                  <GraduationCap size={28} color="#5C2E2E" />
                </View>
                <View className="flex-1">
                  <Text className="text-xl font-bold text-gray-900">Student</Text>
                  <Text className="text-gray-500 text-sm">Scan study load</Text>
                </View>
                <ArrowRight size={20} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Faculty Card */}
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => handleRoleSelection('faculty')}
                className="bg-white rounded-2xl p-5 flex-row items-center shadow-sm"
              >
                <View className="bg-orange-100 p-3 rounded-full mr-4">
                  <Briefcase size={28} color="#7C2D12" />
                </View>
                <View className="flex-1">
                  <Text className="text-xl font-bold text-gray-900">Faculty</Text>
                  <Text className="text-gray-500 text-sm">Scan teaching load</Text>
                </View>
                <ArrowRight size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          </View>

        ) : (
          /* --- SCANNER VIEW (Active once role is selected) --- */
          <View className="flex-1 items-center pt-8">

            {/* Viewfinder Center */}
            <View className="w-full aspect-[3/4] relative justify-center items-center">
              {/* Corner Brackets */}
              <View className="absolute top-0 left-0 w-12 h-12 border-l-4 border-t-4 border-white" />
              <View className="absolute top-0 right-0 w-12 h-12 border-r-4 border-t-4 border-white" />
              <View className="absolute bottom-0 left-0 w-12 h-12 border-l-4 border-b-4 border-white" />
              <View className="absolute bottom-0 right-0 w-12 h-12 border-r-4 border-b-4 border-white" />

              <View className="w-full h-full relative p-4">
                {selectedFile ? (
                  /* Preview Image */
                  <View className="w-full h-full rounded-lg overflow-hidden bg-white/10 border border-white/30">
                    {selectedFile.mimeType?.startsWith('image/') ? (
                      <Image source={{ uri: selectedFile.uri }} className="w-full h-full" resizeMode="contain" />
                    ) : (
                      <View className="flex-1 justify-center items-center bg-white/90">
                        <Files size={64} color="#B88080" />
                        <Text className="text-gray-800 font-bold text-lg mt-4 text-center px-4">{selectedFile.name}</Text>
                        <Text className="text-gray-500 mt-1">{(selectedFile.size / 1024).toFixed(1)} KB</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  /* Empty State Text */
                  <View className="flex-1 justify-center items-center">
                    <Text className="text-white/50 text-center font-medium">Align schedule within frame</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Bottom Controls */}
            <View className="flex-row justify-around items-center w-full mt-10 px-8 py-4 bg-white/10 rounded-3xl">
              <TouchableOpacity onPress={handleImageGallery} className="p-3 bg-white rounded-full">
                <Images size={24} color="#444" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={selectedFile ? resetScanner : handleCameraCapture}
                className="w-16 h-16 bg-white rounded-full justify-center items-center border-4 border-[#B88080]"
              >
                <View className="w-12 h-12 bg-[#B88080] rounded-full" />
              </TouchableOpacity>

              <TouchableOpacity onPress={handleDocumentUpload} className="p-3 bg-white rounded-full">
                <Files size={24} color="#444" />
              </TouchableOpacity>
            </View>

            {/* Role Indicator */}
            <View className="mt-6 bg-black/20 px-4 py-1 rounded-full">
              <Text className="text-white text-xs font-medium uppercase tracking-widest">{selectedRole} Mode</Text>
            </View>

          </View>
        )}
      </View>

      {/* Loading Overlay */}
      {isUploading && (
        <View className="absolute inset-0 bg-black/50 justify-center items-center z-50">
          <View className="bg-white rounded-xl p-6 items-center w-64">
            <ActivityIndicator size="large" color="#B88080" />
            <Text className="mt-4 text-lg font-bold text-gray-800">Processing</Text>
            <Text className="text-sm text-gray-500 mt-1">Extracting course data...</Text>
          </View>
        </View>
      )}

      {/* Title Input Modal */}
      <Modal
        visible={showTitleModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowTitleModal(false)}
      >
        <View className="flex-1 bg-black/60 justify-center items-center px-6">
          <View className="bg-white rounded-2xl p-6 w-full shadow-lg">
            <Text className="text-xl font-bold text-gray-800 mb-1">Save Schedule</Text>
            <Text className="text-sm text-gray-500 mb-4">{uploadedCourses.length} courses extracted</Text>

            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-3 text-base"
              placeholder="e.g., 1st Sem 2025"
              value={scheduleTitle}
              onChangeText={setScheduleTitle}
              autoFocus
            />

            {/* Semester Picker */}
            <Text className="text-sm font-semibold text-gray-700 mb-2">Semester</Text>
            <View className="flex-row gap-2 mb-3">
              {[
                { label: '1st Sem', value: '1ST' },
                { label: '2nd Sem', value: '2ND' },
                { label: 'Summer', value: 'SUMMER' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setUploadedSemester(opt.value)}
                  className={`flex-1 py-2 rounded-lg border ${uploadedSemester === opt.value
                      ? 'bg-[#B88080] border-[#B88080]'
                      : 'bg-gray-50 border-gray-200'
                    }`}
                >
                  <Text
                    className={`text-center text-sm font-semibold ${uploadedSemester === opt.value ? 'text-white' : 'text-gray-600'
                      }`}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* School Year */}
            <Text className="text-sm font-semibold text-gray-700 mb-2">School Year</Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4 text-base"
              placeholder="e.g., 2025-2026"
              value={uploadedSchoolYear}
              onChangeText={setUploadedSchoolYear}
            />

            <View className="gap-3">
              <TouchableOpacity className="bg-[#B88080] py-3 rounded-xl" onPress={saveAndApplyReminders}>
                <Text className="text-center font-bold text-white">Save & Apply Active</Text>
              </TouchableOpacity>

              <TouchableOpacity className="bg-gray-100 py-3 rounded-xl" onPress={saveScheduleOnly}>
                <Text className="text-center font-semibold text-gray-700">Save Only</Text>
              </TouchableOpacity>

              <TouchableOpacity className="py-2" onPress={() => { setShowTitleModal(false); setScheduleTitle(''); resetScanner(); }}>
                <Text className="text-center text-gray-400">Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Faculty Mode Unlock Modal */}
      <FacultyModeModal
        visible={showFacultyModeModal}
        onConfirm={handleFacultyModeConfirm}
        onDismiss={handleFacultyModeDismiss}
      />

    <Modal
      visible={reportModal}
      transparent={true}
      animationType="fade"
      onRequestClose={dismissErrorModal}
    >
      <View className="flex-1 bg-black/60 justify-center items-center px-6">
        <View className="bg-white rounded-2xl w-full shadow-lg overflow-hidden">

          {/* Error Banner */}
          {uploadError ? (
            <View className="bg-red-50 px-5 pt-5 pb-4 border-b border-red-100">
              <View className="flex-row items-start">
                <View className="bg-red-100 p-2 rounded-full mr-3 mt-0.5">
                  <AlertTriangle size={20} color="#DC2626" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-red-700 mb-1">Upload Failed</Text>
                  <Text className="text-sm text-red-600 leading-5">{uploadError}</Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* Report Form */}
          <View className="p-5">
            <Text className="text-lg font-bold text-gray-800 mb-1">Report a Problem</Text>
            <Text className="text-xs text-gray-400 mb-3">Optionally describe what happened so we can investigate.</Text>

            <TextInput
              className="bg-gray-50 p-4 rounded-xl text-gray-800 border border-gray-200 min-h-[100px]"
              placeholder="e.g. Ayaw mag scan / Kulang schedule"
              placeholderTextColor="#A0A0A0"
              multiline={true}
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={MAX_REPORT_LENGTH}
              value={incidentDetails}
              onChangeText={setIncidentDetails}
            />
            <Text className="text-[10px] text-gray-300 text-right mt-1">{incidentDetails.length}/{MAX_REPORT_LENGTH}</Text>

            {/* Actions */}
            <View className="flex-row gap-x-3 mt-3">
              <TouchableOpacity
                className="flex-1 py-3 rounded-xl border border-gray-200"
                onPress={dismissErrorModal}
              >
                <Text className="text-center font-semibold text-gray-500">Dismiss</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="flex-1 py-3 rounded-xl bg-[#B88080]"
                onPress={handleSubmit}
                disabled={!incidentDetails.trim()}
                style={{ opacity: incidentDetails.trim() ? 1 : 0.4 }}
              >
                <Text className="text-center font-bold text-white">Submit Report</Text>
              </TouchableOpacity>
            </View>
          </View>

        </View>
      </View>
    </Modal>

    </View>
  );
}