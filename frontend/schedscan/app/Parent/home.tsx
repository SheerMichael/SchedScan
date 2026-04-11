import { View, Text, TouchableOpacity, ScrollView, Image, ActivityIndicator, TextInput, Alert, Modal } from "react-native";
import React, { useState, useCallback } from "react";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../../context/AuthContext";
import { parentService, LinkedChild, ChildInfo, StudentSearchResult } from "../../services/parentService";
import { parentRemarkService, FacultyRemark } from "../../services/remarkService";
import { paymentService } from "../../services/paymentService";
import * as WebBrowser from 'expo-web-browser';
import { Plus, X, Users, Calendar, MessageSquare, CreditCard } from "lucide-react-native";
import Svg, { Path } from "react-native-svg";

// --- Types ---
type Course = {
  id: number;
  subject_code: string;
  subject_name: string;
  start_time: string;
  end_time: string;
  day: string;
  location: string;
};

const ParentHomePage = () => {
  const { user, logout } = useAuth();

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [children, setChildren] = useState<LinkedChild[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildInfo | null>(null);
  const [schedule, setSchedule] = useState<any | null>(null);
  const [todaysCourses, setTodaysCourses] = useState<Course[]>([]);

  // Link child modal state
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [requestError, setRequestError] = useState("");

  // Payment state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Remarks state
  const [remarks, setRemarks] = useState<FacultyRemark[]>([]);
  const [isLoadingRemarks, setIsLoadingRemarks] = useState(false);
  const [viewingParentRemark, setViewingParentRemark] = useState<FacultyRemark | null>(null);

  // Load data on focus
  useFocusEffect(
    useCallback(() => {
      loadChildrenData();
    }, [])
  );

  const loadChildrenData = async () => {
    try {
      setIsLoading(true);

      const response = await parentService.getLinkedChildren();
      setChildren(response.children);

      // Auto-select first child if available
      if (response.children.length > 0 && !selectedChild) {
        await selectChild(response.children[0].child);
      } else if (selectedChild) {
        // Refresh current child's schedule and remarks
        await loadChildSchedule(selectedChild.id);
        await loadChildRemarks(selectedChild.id);
      } else {
        setSelectedChild(null);
        setSchedule(null);
        setTodaysCourses([]);
        setRemarks([]);
      }
    } catch (error: any) {
      console.error("Error loading children:", error);
      Alert.alert("Error", "Failed to load children. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const selectChild = async (child: ChildInfo) => {
    setSelectedChild(child);
    await loadChildSchedule(child.id);
    await loadChildRemarks(child.id);
  };

  const loadChildSchedule = async (childId: number) => {
    try {
      const scheduleData = await parentService.getChildSchedule(childId);
      setSchedule(scheduleData.schedule);

      if (scheduleData.schedule?.courses) {
        const today = getDayAbbrev(new Date().getDay());
        const filtered = scheduleData.schedule.courses.filter(
          (c: Course) => c.day === today
        );
        setTodaysCourses(filtered);
      } else {
        setTodaysCourses([]);
      }
    } catch (error: any) {
      console.log('No schedule available for child');
      setSchedule(null);
      setTodaysCourses([]);
    }
  };

  const loadChildRemarks = async (childId: number) => {
    try {
      setIsLoadingRemarks(true);
      const remarksData = await parentRemarkService.getRemarks(childId);
      setRemarks(remarksData);
    } catch (error: any) {
      console.log('Remarks not available:', error?.response?.status);
      setRemarks([]);
    } finally {
      setIsLoadingRemarks(false);
    }
  };

  const handleAddChild = async () => {
    setRequestError("");
    setSearchQuery("");
    setSearchResults([]);
    setShowLinkModal(true);
  };

  const handlePayment = async () => {
    try {
      setIsProcessingPayment(true);

      // Create Stripe Checkout Session
      const { checkout_url, session_id } = await paymentService.createCheckoutSession();

      // Open Stripe Checkout in a browser
      setShowPaymentModal(false);
      const browserResult = await WebBrowser.openBrowserAsync(checkout_url);

      // After browser closes, poll for payment status
      if (browserResult.type === 'cancel' || browserResult.type === 'dismiss') {
        // User may have completed payment before dismissing
        // Poll a few times to check
        for (let i = 0; i < 5; i++) {
          const status = await paymentService.checkPaymentStatus(session_id);
          if (status.status === 'completed') {
            Alert.alert(
              "Payment Successful! ✅",
              "You can now add another child. Search for your child and send a request.",
              [{ text: "Continue", onPress: () => setShowLinkModal(true) }]
            );
            return;
          }
          if (status.status === 'failed') break;
          // Wait 1 second before next poll
          await new Promise(r => setTimeout(r, 1000));
        }

        // If we get here, payment wasn't completed
        Alert.alert(
          "Payment Not Completed",
          "It looks like the payment wasn't completed. You can try again anytime.",
          [{ text: "OK" }]
        );
      }
    } catch (error: any) {
      const message = error.response?.data?.error || "Payment failed. Please try again.";
      Alert.alert("Payment Error", message);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleSearchChildren = async () => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setRequestError("Enter at least 2 characters to search.");
      return;
    }

    try {
      setIsSearching(true);
      setRequestError("");

      const results = await parentService.searchChildren(query);
      setSearchResults(results);
      if (results.length === 0) {
        setRequestError("No matching student found.");
      }
    } catch (error: any) {
      const message = error.response?.data?.error || "Failed to search students. Please try again.";
      setRequestError(message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleRequestChildLink = async (child: StudentSearchResult) => {
    if (child.is_already_linked || child.has_pending_request) {
      return;
    }

    try {
      setIsSendingRequest(true);
      setRequestError("");

      const result = await parentService.requestChildLink(child.id);

      Alert.alert("Request Sent", result.message || `Request sent to ${child.full_name}.`);
      setShowLinkModal(false);
      setSearchQuery("");
      setSearchResults([]);
    } catch (error: any) {
      if (error.response?.status === 402) {
        setShowLinkModal(false);
        setShowPaymentModal(true);
      } else {
        const message = error.response?.data?.error || "Failed to send request. Please try again.";
        setRequestError(message);
      }
    } finally {
      setIsSendingRequest(false);
    }
  };

  const handleUnlink = async (child: ChildInfo) => {
    Alert.alert(
      "Unlink Child",
      `Are you sure you want to unlink from ${child.full_name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unlink",
          style: "destructive",
          onPress: async () => {
            try {
              await parentService.unlinkFromChild(child.id);

              // Remove from local state
              setChildren(prev => prev.filter(c => c.child.id !== child.id));

              // If this was the selected child, clear selection
              if (selectedChild?.id === child.id) {
                setSelectedChild(null);
                setSchedule(null);
                setTodaysCourses([]);
              }

              Alert.alert("Unlinked", `You have been unlinked from ${child.full_name}.`);
            } catch (error) {
              Alert.alert("Error", "Failed to unlink. Please try again.");
            }
          }
        }
      ]
    );
  };

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        onPress: async () => {
          await logout();
          router.replace("/intro/getstarted");
        }
      }
    ]);
  };

  const getDayAbbrev = (dayNum: number): string => {
    const days = ['S', 'M', 'T', 'W', 'TH', 'F', 'S'];
    return days[dayNum];
  };

  const getDayName = (abbrev: string): string => {
    const dayNames: Record<string, string> = {
      'M': 'Monday', 'T': 'Tuesday', 'W': 'Wednesday',
      'TH': 'Thursday', 'F': 'Friday', 'S': 'Saturday'
    };
    return dayNames[abbrev] || abbrev;
  };

  // Loading state
  if (isLoading) {
    return (
      <View className="flex-1 bg-gray-50 justify-center items-center">
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text className="mt-4 text-gray-600">Loading...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="w-full h-14 bg-white border-b-2 border-gray-200 justify-between items-center flex-row px-4">
        <View className="flex-row items-center">
          <Image source={require("../../assets/images/logo.png")} className="w-12 h-12" />
          <View className="flex-col ml-2">
            <Text className="text-xl font-bold text-primary-900/50 leading-none">Sched</Text>
            <Text className="text-xl font-bold text-primary-900 leading-none">Scan</Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleLogout}>
          <Text className="text-primary-600 font-semibold">Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1">
        {/* Welcome Header */}
        <View className="bg-primary-600 m-4 p-6 rounded-2xl">
          <Text className="text-3xl font-bold text-white mb-1">Hi, {user?.first_name}!</Text>
          <Text className="text-base text-primary-200">
            {children.length > 0
              ? `Managing ${children.length} child${children.length > 1 ? 'ren' : ''}`
              : "Link to your child's account to get started"}
          </Text>
        </View>

        {/* Children List Section */}
        <View className="px-4 mb-4">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-lg font-bold text-gray-800">
              <Users size={18} color="#374151" /> Linked Children
            </Text>
            <TouchableOpacity
              className="bg-primary-600 px-3 py-2 rounded-lg flex-row items-center"
              onPress={handleAddChild}
            >
              <>
                <Plus size={16} color="#fff" />
                <Text className="text-white font-semibold ml-1">Add Child</Text>
              </>
            </TouchableOpacity>
          </View>

          {children.length === 0 ? (
            <View className="bg-white rounded-xl p-8 border-2 border-dashed border-gray-300 items-center">
              <Text className="text-5xl mb-4">👪</Text>
              <Text className="text-lg font-semibold text-gray-700 text-center mb-2">No children linked yet</Text>
              <Text className="text-gray-500 text-center mb-4">
                Search for your child and send a request for approval
              </Text>
              <TouchableOpacity
                className="bg-primary-600 px-6 py-3 rounded-xl"
                onPress={handleAddChild}
              >
                <Text className="text-white font-bold">Search Child</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
              {children.map((item) => (
                <TouchableOpacity
                  key={item.link_id}
                  onPress={() => selectChild(item.child)}
                  className={`mr-3 p-4 rounded-xl border-2 min-w-[140px] ${selectedChild?.id === item.child.id
                    ? 'bg-primary-50 border-primary-500'
                    : 'bg-white border-gray-200'
                    }`}
                >
                  <View className="items-center">
                    {item.child.profile_picture ? (
                      <Image
                        source={{ uri: item.child.profile_picture }}
                        className="w-14 h-14 rounded-full mb-2"
                      />
                    ) : (
                      <View className="w-14 h-14 rounded-full bg-primary-100 justify-center items-center mb-2">
                        <Text className="text-xl font-bold text-primary-600">
                          {item.child.first_name[0]}
                        </Text>
                      </View>
                    )}
                    <Text className="font-semibold text-gray-800 text-center" numberOfLines={1}>
                      {item.child.first_name}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleUnlink(item.child)}
                      className="mt-2"
                    >
                      <Text className="text-red-500 text-xs">Unlink</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Selected Child's Schedule */}
        {selectedChild && (
          <View className="px-4 mb-20">
            {/* Child Info */}
            <View className="flex-row items-center mb-4">
              <Calendar size={18} color="#374151" />
              <Text className="text-lg font-bold text-gray-800 ml-2">
                {`${selectedChild.first_name}'s Schedule`}
              </Text>
            </View>

            {/* Today's Classes */}
            <Text className="font-semibold text-gray-600 mb-2">Today</Text>
            {!schedule ? (
              <View className="items-center justify-center p-6 bg-white rounded-xl border-dashed border-2 border-gray-200 mb-4">
                <Text className="text-gray-400 font-medium text-center">
                  No active schedule found.{"\n"}
                  They need to upload their schedule first.
                </Text>
              </View>
            ) : todaysCourses.length === 0 ? (
              <View className="items-center justify-center p-6 bg-white rounded-xl border-dashed border-2 border-gray-200 mb-4">
                <Text className="text-gray-400 font-medium">No classes today.</Text>
              </View>
            ) : (
              todaysCourses.map((course, index) => (
                <View
                  key={index}
                  className="bg-white p-4 mb-3 rounded-xl shadow-sm border-l-4 border-primary-500"
                >
                  <Text className="font-bold text-base text-black">{course.subject_code}</Text>
                  {course.subject_name && (
                    <Text className="text-sm text-gray-700">{course.subject_name}</Text>
                  )}
                  <Text className="text-sm text-gray-600">
                    {course.start_time} - {course.end_time}
                  </Text>
                  {course.location && (
                    <Text className="text-sm text-gray-500">{course.location}</Text>
                  )}
                </View>
              ))
            )}

            {/* Full Week Schedule */}
            {schedule && schedule.courses && schedule.courses.length > 0 && (
              <View className="mt-4">
                <Text className="font-semibold text-gray-600 mb-3">Full Week</Text>
                {['M', 'T', 'W', 'TH', 'F', 'S'].map((day) => {
                  const dayCourses = schedule.courses.filter((c: Course) => c.day === day);
                  if (dayCourses.length === 0) return null;

                  return (
                    <View key={day} className="mb-4">
                      <Text className="font-medium text-gray-700 mb-2">{getDayName(day)}</Text>
                      {dayCourses.map((course: Course, idx: number) => (
                        <View key={idx} className="bg-white p-3 mb-2 rounded-lg border border-gray-100">
                          <Text className="font-medium">{course.subject_code}</Text>
                          <Text className="text-sm text-gray-500">
                            {course.start_time} - {course.end_time} {course.location && `• ${course.location}`}
                          </Text>
                        </View>
                      ))}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Faculty Remarks Section */}
            <View className="mt-6">
              <View className="flex-row items-center mb-3">
                <MessageSquare size={18} color="#374151" />
                <Text className="text-lg font-bold text-gray-800 ml-2">
                  Faculty Remarks
                </Text>
                {remarks.length > 0 && (
                  <View className="bg-gray-100 rounded-full px-2 py-0.5 ml-2">
                    <Text className="text-gray-500 text-xs font-medium">{remarks.length}</Text>
                  </View>
                )}
              </View>

              {isLoadingRemarks ? (
                <View className="py-4 items-center">
                  <ActivityIndicator size="small" color="#f97316" />
                </View>
              ) : remarks.length === 0 ? (
                <View className="bg-white p-6 rounded-xl border border-dashed border-gray-200 items-center">
                  <Text className="text-gray-400 font-medium text-center">
                    No remarks from faculty yet.
                  </Text>
                </View>
              ) : (
                remarks.map((remark) => (
                  <TouchableOpacity
                    key={remark.id}
                    onPress={() => setViewingParentRemark(remark)}
                    activeOpacity={0.7}
                    className="bg-white rounded-xl mb-2.5 p-4"
                    style={{
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.05,
                      shadowRadius: 3,
                      elevation: 1,
                    }}
                  >
                    <View className="flex-row items-center mb-2">
                      <View className="w-9 h-9 rounded-full bg-orange-100 justify-center items-center mr-2.5">
                        <Text className="text-sm font-bold text-orange-600">
                          {(remark.faculty_name?.charAt(0) || 'F').toUpperCase()}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="font-semibold text-gray-900 text-sm">{remark.faculty_name}</Text>
                        <View className="flex-row items-center mt-0.5">
                          <View className="bg-orange-100 rounded px-1.5 py-0.5 mr-2">
                            <Text className="text-orange-700 text-xs font-medium">{remark.subject_code}</Text>
                          </View>
                        </View>
                      </View>
                      <Text className="text-gray-400 text-xs">{remark.time_ago}</Text>
                    </View>
                    <Text className="text-gray-700 text-sm leading-5" numberOfLines={3}>
                      {remark.text}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Parent Remark Detail Modal (tap-to-expand) */}
      <Modal visible={!!viewingParentRemark} transparent animationType="fade" onRequestClose={() => setViewingParentRemark(null)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl max-h-[70%]">
            <View className="items-center pt-3 pb-2">
              <View className="w-10 h-1 bg-gray-200 rounded-full" />
            </View>
            {viewingParentRemark && (
              <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: 30 }}>
                <View className="px-5 pb-4">
                  <View className="flex-row items-center mb-4">
                    <View className="w-11 h-11 rounded-full bg-orange-100 justify-center items-center mr-3">
                      <Text className="text-base font-bold text-orange-600">
                        {(viewingParentRemark.faculty_name?.charAt(0) || 'F').toUpperCase()}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-bold text-gray-900 text-base">{viewingParentRemark.faculty_name}</Text>
                      <View className="flex-row items-center mt-0.5">
                        <View className="bg-orange-100 rounded px-1.5 py-0.5 mr-2">
                          <Text className="text-orange-700 text-xs font-medium">{viewingParentRemark.subject_code}</Text>
                        </View>
                        <Text className="text-gray-400 text-xs">{viewingParentRemark.time_ago}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => setViewingParentRemark(null)}
                      className="p-2 bg-gray-100 rounded-full"
                    >
                      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5">
                        <Path d="M18 6L6 18M6 6l12 12" />
                      </Svg>
                    </TouchableOpacity>
                  </View>
                  <View className="h-px bg-gray-100 mb-4" />
                  <Text className="text-gray-800 text-base leading-6">{viewingParentRemark.text}</Text>
                  <Text className="text-gray-400 text-xs mt-4">
                    {viewingParentRemark.created_at
                      ? new Date(viewingParentRemark.created_at).toLocaleString()
                      : viewingParentRemark.time_ago}
                  </Text>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Link Child Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showLinkModal}
        onRequestClose={() => setShowLinkModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center">
          <View className="bg-white rounded-2xl p-6 w-11/12 max-w-md">
            {/* Header */}
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-bold text-gray-800">Search for Child</Text>
              <TouchableOpacity onPress={() => { setShowLinkModal(false); setRequestError(""); setSearchQuery(""); setSearchResults([]); }}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text className="text-gray-600 mb-4">
              Enter your child&apos;s name, email, or student number. We&apos;ll send a connection request for their approval.
            </Text>

            {/* Error Message */}
            {requestError ? (
              <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <Text className="text-red-600 text-sm">{requestError}</Text>
              </View>
            ) : null}

            <View className="flex-row gap-2 mb-4">
              <TextInput
                className="flex-1 bg-gray-100 rounded-xl p-4"
                placeholder="Search by name, email, or student number"
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={(text) => { setSearchQuery(text); setRequestError(""); }}
                onSubmitEditing={handleSearchChildren}
                returnKeyType="search"
                autoCapitalize="none"
              />
              <TouchableOpacity
                className={`bg-primary-600 rounded-xl px-4 justify-center ${isSearching ? 'opacity-50' : ''}`}
                onPress={handleSearchChildren}
                disabled={isSearching}
              >
                {isSearching ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text className="text-white font-semibold">Search</Text>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView className="max-h-64 mb-4">
              {searchResults.map((child) => {
                const isDisabled = isSendingRequest || child.is_already_linked || child.has_pending_request;
                const buttonLabel = child.is_already_linked
                  ? 'Linked'
                  : child.has_pending_request
                    ? 'Pending'
                    : 'Request';

                return (
                <View
                  key={child.id}
                  className="border border-gray-200 rounded-xl p-3 mb-2 flex-row items-center justify-between"
                >
                  <View className="flex-1 pr-3">
                    <Text className="font-semibold text-gray-800">{child.full_name}</Text>
                    <Text className="text-xs text-gray-500 mt-0.5">{child.email}</Text>
                    {child.student_number ? (
                      <Text className="text-xs text-gray-500">{child.student_number}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    className={`rounded-lg px-3 py-2 ${isDisabled ? 'bg-gray-300' : 'bg-primary-600'}`}
                    onPress={() => handleRequestChildLink(child)}
                    disabled={isDisabled}
                  >
                    <Text className={`font-semibold text-sm ${isDisabled ? 'text-gray-600' : 'text-white'}`}>
                      {buttonLabel}
                    </Text>
                  </TouchableOpacity>
                </View>
                );
              })}
            </ScrollView>

            {/* Buttons */}
            <TouchableOpacity
              className="bg-gray-200 rounded-xl py-3"
              onPress={() => { setShowLinkModal(false); setRequestError(""); setSearchQuery(""); setSearchResults([]); }}
            >
              <Text className="text-gray-700 font-semibold text-center">Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Payment Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showPaymentModal}
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center">
          <View className="bg-white rounded-2xl p-6 w-11/12 max-w-md">
            {/* Header */}
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-bold text-gray-800">Add Another Child</Text>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Payment Info */}
            <View className="bg-primary-50 rounded-xl p-4 mb-4">
              <View className="flex-row items-center mb-2">
                <CreditCard size={20} color="#7C3AED" />
                <Text className="text-primary-800 font-semibold text-base ml-2">One-time Payment</Text>
              </View>
              <Text className="text-gray-600 text-sm">
                Your first child is free! To add an additional child, a small one-time fee is required.
              </Text>
            </View>

            {/* Price */}
            <View className="items-center mb-6">
              <Text className="text-4xl font-bold text-primary-600">₱89</Text>
              <Text className="text-gray-500 text-sm mt-1">One-time payment per child</Text>
            </View>

            {/* Features */}
            <View className="mb-6">
              <View className="flex-row items-center mb-2">
                <Text className="text-green-500 mr-2">✓</Text>
                <Text className="text-gray-700 text-sm">View your child&apos;s schedule</Text>
              </View>
              <View className="flex-row items-center mb-2">
                <Text className="text-green-500 mr-2">✓</Text>
                <Text className="text-gray-700 text-sm">See faculty remarks</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-green-500 mr-2">✓</Text>
                <Text className="text-gray-700 text-sm">Lifetime access — no recurring fees</Text>
              </View>
            </View>

            {/* Buttons */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 bg-gray-200 rounded-xl py-3"
                onPress={() => setShowPaymentModal(false)}
              >
                <Text className="text-gray-700 font-semibold text-center">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 bg-primary-600 rounded-xl py-3 ${isProcessingPayment ? 'opacity-50' : ''}`}
                onPress={handlePayment}
                disabled={isProcessingPayment}
              >
                {isProcessingPayment ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text className="text-white font-bold text-center">Pay Now</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Secure badge */}
            <View className="items-center mt-3">
              <Text className="text-gray-400 text-xs">Secured by Stripe</Text>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ParentHomePage;