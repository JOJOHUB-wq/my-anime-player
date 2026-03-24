import { Ionicons } from '@expo/vector-icons';
import {
  BottomTabNavigationEventMap,
  BottomTabNavigationOptions,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { ParamListBase, TabNavigationState } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { withLayoutContext } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { useApp } from '@/src/providers/app-provider';

const BottomTabsNavigator = createBottomTabNavigator().Navigator;

const BottomTabs = withLayoutContext<
  BottomTabNavigationOptions,
  typeof BottomTabsNavigator,
  TabNavigationState<ParamListBase>,
  BottomTabNavigationEventMap
>(BottomTabsNavigator);

function getTabIcon(name: string): keyof typeof Ionicons.glyphMap {
  if (name === 'discover') {
    return 'sparkles-outline';
  }

  if (name === 'downloads') {
    return 'download-outline';
  }

  if (name === 'settings') {
    return 'settings-outline';
  }

  if (name === 'social') {
    return 'people-outline';
  }

  return 'layers-outline';
}

function AnimatedTabButton(props: any) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.tabButtonWrap, animatedStyle]}>
      <Pressable
        accessibilityState={props.accessibilityState}
        accessibilityLabel={props.accessibilityLabel}
        accessibilityRole={props.accessibilityRole}
        testID={props.testID}
        onPress={props.onPress}
        onLongPress={props.onLongPress}
        onPressIn={(event) => {
          scale.value = withSpring(0.92, {
            damping: 16,
            stiffness: 240,
          });
          props.onPressIn?.(event);
        }}
        onPressOut={(event) => {
          scale.value = withSpring(1, {
            damping: 14,
            stiffness: 220,
          });
          props.onPressOut?.(event);
        }}
        style={typeof props.style === 'function' ? props.style({}) : [styles.tabButton, props.style]}>
        {props.children}
      </Pressable>
    </Animated.View>
  );
}

export default function TabsLayout() {
  const { theme } = useApp();
  const { t } = useTranslation();

  return (
    <BottomTabs
      initialRouteName="local"
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: {
          backgroundColor: 'transparent',
        },
        animation: 'fade',
        tabBarActiveTintColor: theme.textPrimary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: true,
        tabBarButton: (props) => <AnimatedTabButton {...props} />,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIconStyle: styles.tabIcon,
        tabBarStyle: [
          styles.tabBar,
          {
            borderColor: theme.tabBarBorder,
          },
        ],
        tabBarBackground: () => (
          <BlurView
            intensity={72}
            tint="dark"
            style={[
              StyleSheet.absoluteFill,
              styles.tabBarBackground,
              {
                backgroundColor: theme.tabBarBackground,
                borderColor: theme.tabBarBorder,
              },
            ]}
          />
        ),
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons
            name={getTabIcon(route.name)}
            size={focused ? size + 1 : size}
            color={color}
          />
        ),
      })}>
      <BottomTabs.Screen
        name="local"
        options={{
          title: t('tabs.local'),
        }}
      />
      <BottomTabs.Screen
        name="discover"
        options={{
          title: 'Online',
        }}
      />
      <BottomTabs.Screen
        name="downloads"
        options={{
          title: t('tabs.downloads'),
        }}
      />
      <BottomTabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
        }}
      />
      <BottomTabs.Screen
        name="social"
        options={{
          title: t('tabs.social', { defaultValue: 'Social' }),
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
    height: 78,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 0,
    borderWidth: 1,
    borderRadius: 28,
    elevation: 0,
    backgroundColor: 'transparent',
  },
  tabBarBackground: {
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  tabIcon: {
    marginTop: 2,
  },
  tabButtonWrap: {
    flex: 1,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
