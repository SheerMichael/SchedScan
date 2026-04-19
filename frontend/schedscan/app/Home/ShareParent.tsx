import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { parentService, LinkedParent, ParentLinkRequest } from '../../services/parentService';

const ShareWithParentScreen = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [isUpdatingRequest, setIsUpdatingRequest] = useState(false);
    const [linkedParents, setLinkedParents] = useState<LinkedParent[]>([]);
    const [pendingRequests, setPendingRequests] = useState<ParentLinkRequest[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setIsLoading(true);

            // Get linked parents
            const parents = await parentService.getLinkedParents();
            setLinkedParents(parents.filter(p => p.status === 'active'));

            const incomingRequests = await parentService.getIncomingParentLinkRequests();
            setPendingRequests(incomingRequests);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const approveRequest = async (requestId: number, parentName: string) => {
        try {
            setIsUpdatingRequest(true);
            await parentService.approveParentLinkRequest(requestId);
            Alert.alert('Request Approved', `${parentName} can now view your schedule.`);
            await loadData();
        } catch (error: any) {
            const needsPayment =
                error?.response?.status === 402 ||
                error?.response?.data?.needs_payment === true;

            if (needsPayment) {
                Alert.alert(
                    'Parent Payment Required',
                    `${parentName} has reached their child-link limit. Ask them to complete payment for an additional child slot, then try approving again.`
                );
                return;
            }

            const message = error?.response?.data?.error || 'Failed to approve request';
            Alert.alert('Error', message);
        } finally {
            setIsUpdatingRequest(false);
        }
    };

    const handleApprove = (requestId: number, parentName: string) => {
        Alert.alert(
            'Confirm Parent Link',
            `Do you want to link with ${parentName}? They will be able to view your schedule after approval.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Confirm Link',
                    onPress: () => {
                        approveRequest(requestId, parentName);
                    },
                },
            ]
        );
    };

    const handleReject = async (requestId: number) => {
        try {
            setIsUpdatingRequest(true);
            await parentService.rejectParentLinkRequest(requestId);
            await loadData();
        } catch (error) {
            Alert.alert('Error', 'Failed to reject request');
        } finally {
            setIsUpdatingRequest(false);
        }
    };

    const revokeParent = async (parent: LinkedParent) => {
        Alert.alert(
            'Revoke Access',
            `Are you sure you want to revoke ${parent.parent_name}'s access to your schedule?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Revoke',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await parentService.revokeParentAccess(parent.id);
                            setLinkedParents(prev => prev.filter(p => p.id !== parent.id));
                            Alert.alert('Access Revoked', `${parent.parent_name} can no longer view your schedule.`);
                        } catch (error) {
                            Alert.alert('Error', 'Failed to revoke access');
                        }
                    }
                }
            ]
        );
    };

    const ChevronLeftIcon = ({ size = 24, color = '#000' }) => (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
            <Path d="M19 12H6M12 5l-7 7 7 7" />
        </Svg>
    );

    if (isLoading) {
        return (
            <SafeAreaView className="flex-1 bg-white justify-center items-center">
                <ActivityIndicator size="large" color="#2563EB" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-white px-4">
            {/* Header */}
            <View className="flex-row items-center mb-6 pt-2">
                <TouchableOpacity onPress={() => router.back()} className="p-2">
                    <ChevronLeftIcon size={24} color="#000" />
                </TouchableOpacity>
                <Text className="text-xl font-bold ml-2">Share with Parent</Text>
            </View>

            {/* Intro */}
            <View className="bg-primary-50 p-4 rounded-xl mb-6">
                <Text className="text-lg font-semibold text-primary-800 mb-2">Share Access with a Parent</Text>
                <Text className="text-gray-600">
                    Parents can search for your account and send a connection request. Approve only requests you trust.
                </Text>
            </View>

            {/* Pending Request Section */}
            <View className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
                <Text className="text-base font-semibold text-gray-700 mb-4">Pending Parent Requests</Text>

                {pendingRequests.length === 0 ? (
                    <View className="bg-gray-50 rounded-xl p-4 border border-dashed border-gray-300">
                        <Text className="text-gray-500 text-center">No pending requests.</Text>
                    </View>
                ) : (
                    pendingRequests.map((request) => (
                        <View key={request.id} className="border border-gray-200 rounded-xl p-4 mb-2">
                            <Text className="font-semibold text-gray-800">{request.parent_name}</Text>
                            <Text className="text-sm text-gray-500 mb-3">{request.parent_email}</Text>
                            <View className="flex-row gap-2">
                                <TouchableOpacity
                                    className={`flex-1 bg-primary-600 rounded-lg py-2 ${isUpdatingRequest ? 'opacity-50' : ''}`}
                                    onPress={() => handleApprove(request.id, request.parent_name)}
                                    disabled={isUpdatingRequest}
                                >
                                    <Text className="text-white font-semibold text-center">Approve</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    className={`flex-1 bg-gray-200 rounded-lg py-2 ${isUpdatingRequest ? 'opacity-50' : ''}`}
                                    onPress={() => handleReject(request.id)}
                                    disabled={isUpdatingRequest}
                                >
                                    <Text className="text-gray-700 font-semibold text-center">Reject</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))
                )}
            </View>

            {/* Linked Parents Section */}
            <View>
                <Text className="text-base font-semibold text-gray-700 mb-3">Linked Parents</Text>

                {linkedParents.length === 0 ? (
                    <View className="bg-gray-50 rounded-xl p-6 border border-dashed border-gray-300">
                        <Text className="text-gray-400 text-center">
                            No parents linked yet.{"\n"}Approve a pending request to connect.
                        </Text>
                    </View>
                ) : (
                    linkedParents.map((parent) => (
                        <View
                            key={parent.id}
                            className="bg-white border border-gray-200 rounded-xl p-4 mb-2 flex-row items-center justify-between"
                        >
                            <View className="flex-1">
                                <Text className="font-semibold text-gray-800">{parent.parent_name}</Text>
                                <Text className="text-sm text-gray-500">{parent.parent_email}</Text>
                            </View>
                            <TouchableOpacity
                                className="bg-red-50 px-3 py-2 rounded-lg"
                                onPress={() => revokeParent(parent)}
                            >
                                <Text className="text-red-600 font-medium text-sm">Revoke</Text>
                            </TouchableOpacity>
                        </View>
                    ))
                )}
            </View>
        </SafeAreaView>
    );
};

export default ShareWithParentScreen;
