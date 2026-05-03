import React, { useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import { UserContext } from '../context/UserContext';
import { colors } from '../theme';

import LoginScreen    from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import HomeScreen     from '../screens/HomeScreen';
import ProjectScreen  from '../screens/ProjectScreen';

const Stack = createNativeStackNavigator();

const navTheme = {
  dark: true,
  colors: {
    primary:    colors.primary,
    background: colors.bg,
    card:       colors.bg,
    text:       colors.textPrimary,
    border:     colors.border,
    notification: colors.primary,
  },
};

export default function AppNavigator() {
  const { user, loading } = useContext(UserContext);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        {user ? (
          // ── Authenticated stack ──────────────────────────
          <>
            <Stack.Screen name="Home"    component={HomeScreen}    />
            <Stack.Screen name="Project" component={ProjectScreen} />
          </>
        ) : (
          // ── Auth stack ───────────────────────────────────
          <>
            <Stack.Screen name="Login"    component={LoginScreen}    />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
