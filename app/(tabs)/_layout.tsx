import {
  BottomTabNavigationEventMap,
  BottomTabNavigationOptions,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { ParamListBase, TabNavigationState } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { withLayoutContext } from 'expo-router';
import { StyleSheet } from 'react-native';

import { LIQUID_COLORS } from '@/src/theme/liquid';

const BottomTabsNavigator = createBottomTabNavigator().Navigator;

const BottomTabs = withLayoutContext<
  BottomTabNavigationOptions,
  typeof BottomTabsNavigator,
  TabNavigationState<ParamListBase>,
  BottomTabNavigationEventMap
>(BottomTabsNavigator);

function getTabIcon(name: string): keyof typeof Ionicons.glyphMap {
  if (name === 'downloads') {
    return 'folder-open-outline';
  }

  if (name === 'settings') {
    return 'settings-outline';
  }

  return 'library-outline';
}

export default function TabsLayout() {
  return (
    <BottomTabs
      initialRouteName="library"
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: {
          backgroundColor: 'transparent',
        },
        tabBarActiveTintColor: LIQUID_COLORS.textPrimary,
        tabBarInactiveTintColor: LIQUID_COLORS.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={getTabIcon(route.name)} size={size} color={color} />
        ),
      })}>
      <BottomTabs.Screen
        name="library"
        options={{
          title: 'Бібліотека',
        }}
      />
      <BottomTabs.Screen
        name="downloads"
        options={{
          title: 'Файли',
        }}
      />
      <BottomTabs.Screen
        name="settings"
        options={{
          title: 'Налаштування',
        }}
      />
    </BottomTabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    height: 72,
    borderTopWidth: 0,
    borderRadius: 26,
    backgroundColor: 'rgba(10,16,32,0.92)',
    elevation: 0,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
    paddingBottom: 6,
  },
});
