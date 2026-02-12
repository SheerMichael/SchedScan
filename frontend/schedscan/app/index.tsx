import { Redirect } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { View, ActivityIndicator } from "react-native";

export default function Index() {
  const { isAuthenticated, isLoading, user } = useAuth();

  // Show nothing while checking auth state (splash screen is still visible)
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#B88080" />
      </View>
    );
  }

  // If authenticated, go straight to home
  if (isAuthenticated) {
    const isParent = user?.user_type === 'parent';
    return <Redirect href={isParent ? "/Parent/home" : "/Home/home"} />;
  }

  // Not authenticated, show intro
  return <Redirect href="/intro/intro" />;
}