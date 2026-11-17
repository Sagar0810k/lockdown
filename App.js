import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { C } from './src/theme';
import HomeScreen from './src/screens/HomeScreen';
import AppsScreen from './src/screens/AppsScreen';
import StatsScreen from './src/screens/StatsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SessionScreen from './src/screens/SessionScreen';
import { Lockdown, nativeAvailable, safeStatus } from './src/native';
import { loadBlocked, consumeNativeReport } from './src/storage';

export default function App() {
  const [tab, setTab] = useState('home');
  const [blocked, setBlocked] = useState([]);
  const [session, setSession] = useState(null); // native status object while locked
  const [sessionMeta, setSessionMeta] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const syncFromNative = useCallback(async () => {
    const s = await safeStatus();
    if (s?.active) {
      setSession(s);
      return;
    }
    // Session may have finished while we were away (alarm fired, reboot, etc.)
    if (nativeAvailable) {
      try {
        const reportJson = await Lockdown.consumeReport();
        if (reportJson) {
          const byPkg = await Lockdown.getAttemptsByPackage().catch(() => null);
          await consumeNativeReport(reportJson, byPkg);
          setRefreshTick((t) => t + 1);
        }
      } catch {
        // report stays for next open — harmless
      }
    }
    setSession(null);
  }, []);

  useEffect(() => {
    loadBlocked().then(setBlocked);
    syncFromNative();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncFromNative();
    });
    return () => sub.remove();
  }, [syncFromNative]);

  const handleSessionStarted = (status, meta) => {
    setSession(status);
    setSessionMeta(meta);
    setRefreshTick((t) => t + 1);
  };

  const handleSessionEnded = async () => {
    setSession(null);
    setSessionMeta(null);
    await syncFromNative();
    setRefreshTick((t) => t + 1);
  };

  if (session?.active) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
          <StatusBar barStyle="light-content" backgroundColor={C.bg} />
          <SessionScreen
            status={session}
            blocked={sessionMeta?.blocked || blocked}
            strict={!!sessionMeta?.strict}
            onEnded={handleSessionEnded}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <View style={{ flex: 1 }}>
          {tab === 'home' && (
            <HomeScreen
              blocked={blocked}
              refreshTick={refreshTick}
              onStart={handleSessionStarted}
              goToApps={() => setTab('apps')}
              goToSettings={() => setTab('settings')}
            />
          )}
          {tab === 'apps' && <AppsScreen blocked={blocked} setBlocked={setBlocked} />}
          {tab === 'stats' && <StatsScreen refreshTick={refreshTick} />}
          {tab === 'settings' && <SettingsScreen refreshTick={refreshTick} />}
        </View>
        <TabBar tab={tab} onChange={setTab} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const TABS = [
  { id: 'home', icon: 'home', label: 'Focus' },
  { id: 'apps', icon: 'grid', label: 'Apps' },
  { id: 'stats', icon: 'bar-chart', label: 'Stats' },
  { id: 'settings', icon: 'settings', label: 'Setup' },
];

function TabBar({ tab, onChange }) {
  return (
    <View style={styles.tabBar}>
      {TABS.map((t) => {
        const active = tab === t.id;
        return (
          <TouchableOpacity key={t.id} onPress={() => onChange(t.id)} style={styles.tabBtn} activeOpacity={0.7}>
            <Ionicons name={t.icon} size={22} color={active ? C.amber : C.dim} />
            <Text style={[styles.tabLabel, active && { color: C.amber }]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface, paddingBottom: 6, paddingTop: 8 },
  tabBtn: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 },
  tabLabel: { color: C.dim, fontSize: 11, fontWeight: '700' },
});
