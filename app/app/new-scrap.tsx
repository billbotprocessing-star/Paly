import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, spacing, type as typeTokens } from '../lib/theme';
import { useScraps } from '../lib/scraps-context';

type CaptureMode = 'type' | 'paste' | 'photo';

export default function NewScrapScreen() {
  const { addScrap } = useScraps();
  const [mode, setMode] = useState<CaptureMode>('type');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [photoName, setPhotoName] = useState<string | null>(null);

  const canShip = title.trim().length > 0 || photoName;

  async function handlePickPhoto() {
    setMode('photo');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPhotoName(asset.fileName ?? 'Photo scrap');
      if (!title.trim()) setTitle(asset.fileName ?? 'Photo scrap');
    }
  }

  function handleCreate() {
    const scrap = addScrap({
      title: title || photoName || 'New scrap',
      subtitle: detail || (photoName ? 'Photo — tap to clarify' : 'Tap to clarify with Paly'),
    });
    router.replace({ pathname: '/scrap/[id]', params: { id: scrap.id } });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.screen}>
          <Text style={styles.prompt}>Got something confusing? Drop it here.</Text>

          <View style={styles.modeRow}>
            <ModeButton label="Type" icon="⌨️" active={mode === 'type'} onPress={() => setMode('type')} />
            <ModeButton label="Paste" icon="📋" active={mode === 'paste'} onPress={() => setMode('paste')} />
            <ModeButton label="Photo" icon="📷" active={mode === 'photo'} onPress={handlePickPhoto} />
          </View>

          {mode === 'photo' && photoName ? (
            <View style={styles.photoBadge}>
              <Text style={styles.photoBadgeText}>📎 {photoName}</Text>
            </View>
          ) : null}

          <TextInput
            style={styles.titleInput}
            placeholder="What is this about? (e.g. Bio ch.4 — mitosis)"
            placeholderTextColor={colors.muted}
            value={title}
            onChangeText={setTitle}
          />

          <TextInput
            style={styles.detailInput}
            placeholder={
              mode === 'paste'
                ? 'Paste the question or passage you\'re stuck on…'
                : 'Photo, paste, or type a question…'
            }
            placeholderTextColor={colors.muted}
            value={detail}
            onChangeText={setDetail}
            multiline
            textAlignVertical="top"
          />

          <Pressable
            style={[styles.shipButton, !canShip && styles.shipButtonDisabled]}
            disabled={!canShip}
            onPress={handleCreate}
          >
            <Text style={styles.shipButtonText}>Start clarifying</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ModeButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.modeButton, active && styles.modeButtonActive]} onPress={onPress}>
      <Text style={{ fontSize: 16 }}>{icon}</Text>
      <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { padding: spacing.xl, gap: spacing.lg },
  prompt: { ...typeTokens.invite, color: colors.muted, textAlign: 'center' },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modeButtonActive: { backgroundColor: colors.lavenderSoft, borderColor: colors.lavender },
  modeLabel: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  modeLabelActive: { color: colors.lavenderDeep },
  photoBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.mint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  photoBadgeText: { color: colors.ink, fontSize: 13 },
  titleInput: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.ink,
  },
  detailInput: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 120,
    fontSize: 15,
    color: colors.ink,
  },
  shipButton: {
    backgroundColor: colors.lavenderDeep,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  shipButtonDisabled: { opacity: 0.4 },
  shipButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
});
