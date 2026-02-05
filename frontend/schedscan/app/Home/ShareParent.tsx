import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { parentService, LinkedParent } from '../../services/parentService';

const ShareWithParentScreen = () => {
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [linkedParents, setLinkedParents] = useState<LinkedParent[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setIsLoading(true);

            // Get active invite code
            const codeResponse = await parentService.getActiveInviteCode();
            if (codeResponse) {
                setInviteCode(codeResponse.code);
            }

            // Get linked parents
            const parents = await parentService.getLinkedParents();
            setLinkedParents(parents.filter(p => p.status === 'active'));
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const generateCode = async () => {
        try {
            setIsGenerating(true);
            const response = await parentService.generateInviteCode();
            setInviteCode(response.code);
            Alert.alert('Code Generated!', response.message);
        } catch (error) {
            Alert.alert('Error', 'Failed to generate invite code');
        } finally {
            setIsGenerating(false);
        }
    };

    const shareCode = async () => {
        if (!inviteCode) return;

        try {
            await Share.share({
                message: `Join SchedScan as a parent to view my schedule!\n\nDownload the app and use this invite code during signup:\n\n${inviteCode}\n\nDownload SchedScan: [App Store/Play Store link]`,
                title: 'SchedScan Parent Invite'
            });
        } catch (error) {
            console.error('Error sharing:', error);
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
                <ActivityIndicator size="large" color="#7C3AED" />
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
                <Text className="text-lg font-semibold text-primary-800 mb-2">👪 Let your parent view your schedule</Text>
                <Text className="text-gray-600">
                    Generate an invite code and share it with your parent. They can use it to create a parent account and view your active schedule.
                </Text>
            </View>

            {/* Invite Code Section */}
            <View className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
                <Text className="text-base font-semibold text-gray-700 mb-4">Your Invite Code</Text>

                {inviteCode ? (
                    <>
                        <View className="bg-gray-100 rounded-xl p-4 mb-4">
                            <Text className="text-3xl font-bold text-center tracking-widest text-primary-600">
                                {inviteCode}
                            </Text>
                        </View>

                        <View className="flex-row gap-2">
                            <TouchableOpacity
                                className="flex-1 bg-primary-600 rounded-xl py-3"
                                onPress={shareCode}
                            >
                                <Text className="text-white font-semibold text-center">Share Code</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                className={`flex-1 bg-gray-200 rounded-xl py-3 ${isGenerating ? 'opacity-50' : ''}`}
                                onPress={generateCode}
                                disabled={isGenerating}
                            >
                                {isGenerating ? (
                                    <ActivityIndicator color="#374151" />
                                ) : (
                                    <Text className="text-gray-700 font-semibold text-center">New Code</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </>
                ) : (
                    <TouchableOpacity
                        className={`bg-primary-600 rounded-xl py-4 ${isGenerating ? 'opacity-50' : ''}`}
                        onPress={generateCode}
                        disabled={isGenerating}
                    >
                        {isGenerating ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text className="text-white font-bold text-center text-lg">Generate Invite Code</Text>
                        )}
                    </TouchableOpacity>
                )}
            </View>

            {/* Linked Parents Section */}
            <View>
                <Text className="text-base font-semibold text-gray-700 mb-3">Linked Parents</Text>

                {linkedParents.length === 0 ? (
                    <View className="bg-gray-50 rounded-xl p-6 border border-dashed border-gray-300">
                        <Text className="text-gray-400 text-center">
                            No parents linked yet.{"\n"}Share your invite code to get started.
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
