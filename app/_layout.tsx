import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useNavigation } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { StyleSheet, Platform, TouchableOpacity } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ChevronLeft } from "lucide-react-native";

if (Platform.OS === 'web') {
  require('leaflet/dist/leaflet.css');
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function BackButton() {
  const router = useRouter();
  const navigation = useNavigation();
  
  const handleBack = () => {
    if (navigation.canGoBack()) {
      router.back();
    } else {
      router.push('/');
    }
  };
  
  return (
    <TouchableOpacity 
      onPress={handleBack}
      style={{ marginLeft: 8, padding: 4 }}
      activeOpacity={0.6}
    >
      <ChevronLeft size={24} color="#1B5E20" />
    </TouchableOpacity>
  );
}

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Back",
        headerStyle: {
          backgroundColor: '#FFFFFF',
        },
        headerTintColor: '#1B5E20',
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="map"
        options={{
          title: 'Urban Green Spaces',
          headerTitleStyle: {
            fontWeight: '700' as const,
          },
          headerLeft: () => <BackButton />,
        }}
      />
      <Stack.Screen
        name="compare"
        options={{
          title: 'Compare Cities',
          headerTitleStyle: {
            fontWeight: '700' as const,
          },
          headerLeft: () => <BackButton />,
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={styles.container}>
        <RootLayoutNav />
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
