import React, { useState, useEffect, useRef } from 'react';
import {View,Text,TouchableOpacity,Animated,Dimensions} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import { router } from 'expo-router';
import { Image } from 'react-native';

const ChevronRightIcon = ({ size = 24, color = '#ffffff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <Path d="M9 18l6-6-6-6" />
  </Svg>
);

const Intro = () => {
  const [currentScreen, setCurrentScreen] = useState('intro1');
  const progressAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  // Auto-progress through intro screens
  useEffect(() => {
    if (currentScreen.startsWith('intro')) {
      const timer = setTimeout(() => {
        if (currentScreen === 'intro1') setCurrentScreen('intro2');
        else if (currentScreen === 'intro2') setCurrentScreen('intro3');
        else if (currentScreen === 'intro3') setCurrentScreen('onboard1');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [currentScreen]);

  // Progress bar animation
  useEffect(() => {
    if (currentScreen.startsWith('intro')) {
      progressAnim.setValue(0);
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: false,
      }).start();
    }
  }, [currentScreen]);


  const IntroScreen = ({ title, bgColor }: { title: string; bgColor: string }) => {
    const progressWidth = progressAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0%', '100%'],
    });

    const getCurrentIndex = () => parseInt(title.slice(-1));

  return (
      <>
        {/* Intro 1 */}
        {title === 'intro1' && (
          <View className='flex-1 bg-primary-900' >
            <View className="flex-1 items-center justify-center">
              <View className="mb-8">
                <View className='bg-primary-900 h-20 w-20 rounded-lg' />
              </View>
            </View>

            {/* Progress dots */}
            <View className="absolute bottom-12 self-center flex-row gap-2">
              {[1, 2, 3].map((dot) => (
                <View
                  key={dot}
                  className={`w-2 h-2 rounded-full ${
                    getCurrentIndex() >= dot ? 'bg-white' : 'bg-white/30'
                  }`}
                />
              ))}
            </View>

            {/* Progress bar */}
            <View className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <Animated.View className="h-full bg-white" style={{ width: progressWidth }} />
            </View>
          </View>
        )}

        {/* Intro 2 */}
        {title === 'intro2' && (
          <View className='flex-1 bg-primary-900'>
            <View className="flex-1 items-center justify-center">
              <View className="mb-8">
                <View className="flex-column items-center gap-2">
                  <Image source={require('../../assets/images/logo.png')}/>
                  <Text className="text-4xl font-bold text-white">SchedScan</Text>
                </View>
              </View>
            </View>

            {/* Shared progress UI */}
            <View className="absolute bottom-12 self-center flex-row gap-2">
              {[1, 2, 3].map((dot) => (
                <View
                  key={dot}
                  className={`w-2 h-2 rounded-full ${
                    getCurrentIndex() >= dot ? 'bg-white' : 'bg-white/30'
                  }`}
                />
              ))}
            </View>

            <View className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <Animated.View className="h-full bg-white" style={{ width: progressWidth }} />
            </View>
          </View>
        )}

        {/* Intro 3 */}
        {title === 'intro3' && (
          <View className='flex-1' style={{ backgroundColor: bgColor }}>
            <View className="flex-1 items-center justify-center">
              <View className="mb-8">
                <View className="flex-column items-center gap-2 bg-white p-4 rounded-lg">
                  <Image source={require('../../assets/images/logo.png')}/>
                    <Text className="text-4xl font-bold text-primary-900/50">
                      Sched<Text className="text-primary-900">Scan</Text>
                    </Text>
                </View>
              </View>
            </View>

            {/* Shared progress UI */}
            <View className="absolute bottom-12 self-center flex-row gap-2">
              {[1, 2, 3].map((dot) => (
                <View
                  key={dot}
                  className={`w-2 h-2 rounded-full ${
                    getCurrentIndex() >= dot ? 'bg-primary-900' : 'bg-white/30'
                  }`}
                />
              ))}
            </View>

            <View className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <Animated.View className="h-full bg-primary-900" style={{ width: progressWidth }} />
            </View>
          </View>
        )}
      </>
    );
  };

  const OnboardingScreen = ({ type }: {type: 'onboard1' | 'onboard2' | 'onboard3'}) => {
    const screens = {
      onboard1: { 
        title: 'Scan',
        description: 'Scan your schedule in seconds-no more manual encoding.',
        illustration: (
          <Image source={require('../../assets/images/onboard1.png')}/>
        ),
      },
      onboard2: {
        title: 'Schedule',
        description: 'Turn scanned schedules into a clean digital timetable with reminders.',
        illustration: (
          <Image source={require('../../assets/images/onboard2.png')}/>
        ),
      },
      onboard3: {
        title: 'Succeed',
        description: 'Stay on track, never miss a class and manage your time with ease!',
        illustration: (
          <Image source={require('../../assets/images/onboard3.png')}/>
        )
      },
    };

    const screen = screens[type];
    const currentIndex = type === 'onboard1' ? 0 : type === 'onboard2' ? 1 : 2;

    return (
      <SafeAreaView className="flex-1 bg-white">
        {/* Header */}
        <View className="flex-row justify-center items-center p-6 pt-16">
          <View className="flex-row items-center gap-2">
            <Text className="text-4xl font-bold text-primary-900/50">
              Sched<Text className="text-primary-900">Scan</Text>
            </Text>
          </View>
        </View>

        {/* Content */}
        <View className="flex-1 items-center justify-center px-8">
          <View className="mb-12">{screen.illustration}</View>

          <Text className="text-4xl font-bold text-primary-900 mb-4">
            {screen.title}
          </Text>

          <Text className="font-semibold text-2xl w-lg text-center mb-8">
            {screen.description}
          </Text>
        </View>

        {/* Bottom Navigation */}
        <View className="p-6">
          <View className="flex-row justify-center gap-2 mb-6">
            {[0, 1, 2].map((dot) => (
              <View
                key={dot}
                className={`h-2 rounded-full ${
                  currentIndex === dot
                    ? 'w-8 bg-primary-600'
                    : 'w-2 bg-primary-200'
                }`}
              />
            ))}
          </View>

          <View className='flex-row justify-between px-9 pb-6'>
            
            <TouchableOpacity onPress={() => router.push('/intro/getstarted')}>
              <Text className="text-accent-gray-medium text-xl flex justify-center items-center">Skip</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (type === 'onboard1') setCurrentScreen('onboard2');
                else if (type === 'onboard2') setCurrentScreen('onboard3');
                else if (type === 'onboard3') router.push('/intro/getstarted'); 
              }}
              className="w-16 h-16 bg-primary-900 py-4 rounded-full flex-row items-center justify-center gap-2 active:bg-primary-700">
              <ChevronRightIcon size={30} color="#ffffff" />
            </TouchableOpacity>

          </View>
        </View>
      </SafeAreaView>
    );
  };

  return (
    <View className="flex-1">
      {currentScreen === 'intro1' && <IntroScreen title="intro1" bgColor="#7f1d1d" />}
      {currentScreen === 'intro2' && <IntroScreen title="intro2" bgColor="#b91c1c" />}
      {currentScreen === 'intro3' && <IntroScreen title="intro3" bgColor="#FFFFFF" />}
      {currentScreen === 'onboard1' && <OnboardingScreen type="onboard1" />}
      {currentScreen === 'onboard2' && <OnboardingScreen type="onboard2" />}
      {currentScreen === 'onboard3' && <OnboardingScreen type="onboard3" />}
    </View>
  );
};

export default Intro;