import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ScrollView, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, RADIUS } from '../theme';
import { LetterAvatar, Chip } from '../components';
import { Lockdown, nativeAvailable } from '../native';
import { saveBlocked } from '../storage';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'social', label: 'Social', match: ['instagram', 'facebook', 'snapchat', 'twitter', 'reddit', 'linkedin', 'pinterest', 'threads', 'tumblr', 'mastodon'] },
  { id: 'video', label: 'Video', match: ['youtube', 'netflix', 'hotstar', 'primevideo', 'mxplayer', 'jiocinema', 'disney', 'tiktok', 'musically', 'twitch'] },
  { id: 'games', label: 'Games', match: ['game', 'supercell', 'miniclip', 'candycrush', 'roblox', 'freefire', 'garena', 'pubg', 'chess', 'solitaire'] },
  { id: 'chat', label: 'Chat', match: ['whatsapp', 'telegram', 'discord', 'slack', 'teams', 'messenger', 'signal'] },
];

export default function AppsScreen({ blocked, setBlocked }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  useEffect(() => {
    let alive = true;
    if (!nativeAvailable) {
      setLoading(false);
      return () => { alive = false; };
    }
    Lockdown.getInstalledApps()
      .then((list) => { if (alive) { setApps(list); setLoading(false); } })
      .catch(() => setLoading(false));
    return () => { alive = false; };
  }, []);

  const selected = useMemo(() => new Set(blocked.map((b) => b.pkg)), [blocked]);

  const filtered = useMemo(() => {
    let out = apps;
    const cat = CATEGORIES.find((c) => c.id === category);
    if (cat && cat.match) {
      out = out.filter((a) => {
        const hay = `${a.pkg} ${a.name}`.toLowerCase();
        return cat.match.some((m) => hay.includes(m));
      });
    }
    const q = query.trim().toLowerCase();
    if (q) out = out.filter((a) => `${a.pkg} ${a.name}`.toLowerCase().includes(q));
    return out;
  }, [apps, query, category]);

  const toggle = (app) => {
    const next = selected.has(app.pkg)
      ? blocked.filter((b) => b.pkg !== app.pkg)
      : [...blocked, { pkg: app.pkg, name: app.name }];
    setBlocked(next);
    saveBlocked(next);
  };

  const clearAll = () => {
    setBlocked([]);
    saveBlocked([]);
  };

  const selectVisible = () => {
    const map = new Map(blocked.map((b) => [b.pkg, b]));
    for (const a of filtered) if (!map.has(a.pkg)) map.set(a.pkg, { pkg: a.pkg, name: a.name });
    const next = [...map.values()];
    setBlocked(next);
    saveBlocked(next);
  };

  const renderItem = ({ item }) => {
    const isOn = selected.has(item.pkg);
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={() => toggle(item)} style={styles.row}>
        {item.icon ? (
          <View style={styles.iconWrap}>
            <Image source={{ uri: item.icon }} style={styles.icon} resizeMode="cover" />
          </View>
        ) : (
          <LetterAvatar name={item.name} pkg={item.pkg} size={46} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.appName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.appPkg} numberOfLines={1}>{item.pkg}</Text>
        </View>
        <Ionicons
          name={isOn ? 'checkmark-circle' : 'ellipse-outline'}
          size={28}
          color={isOn ? C.amber : C.dim}
        />
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Search + actions */}
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={C.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search apps..."
            placeholderTextColor={C.dim}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={18} color={C.muted} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.selectionRow}>
          <Text style={styles.selectionText}>
            <Text style={{ color: C.amber, fontWeight: '800' }}>{blocked.length}</Text> locked
          </Text>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <TouchableOpacity onPress={selectVisible}>
              <Text style={styles.linkText}>Select visible</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={clearAll}>
              <Text style={[styles.linkText, { color: C.red }]}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>
          {CATEGORIES.map((c) => (
            <Chip key={c.id} label={c.label} active={category === c.id} onPress={() => setCategory(c.id)} />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.amber} />
          <Text style={styles.loadingText}>Reading your apps…</Text>
        </View>
      ) : !nativeAvailable ? (
        <View style={styles.center}>
          <Ionicons name="phone-portrait-outline" size={40} color={C.dim} />
          <Text style={styles.loadingText}>Native module unavailable.{'\n'}Install the EAS preview APK.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.pkg}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }}
          initialNumToRender={18}
          windowSize={12}
          removeClippedSubviews
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.loadingText}>No apps match “{query}”.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: 14, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: RADIUS, paddingHorizontal: 12, height: 48, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, color: C.ink, fontSize: 16 },
  selectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  selectionText: { color: C.muted, fontSize: 13 },
  linkText: { color: C.amber, fontWeight: '700', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: RADIUS },
  iconWrap: { width: 46, height: 46, borderRadius: 14, overflow: 'hidden', backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  icon: { width: 46, height: 46 },
  appName: { color: C.ink, fontWeight: '700', fontSize: 15 },
  appPkg: { color: C.muted, fontSize: 11, marginTop: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  loadingText: { color: C.muted, textAlign: 'center', lineHeight: 20 },
});
