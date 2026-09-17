import { StyleSheet } from 'react-native';
const colors = {
  background: '#f5f6f8', surface: '#ffffff', text: '#14241e', muted: '#5c6963',
  accent: '#126344', border: '#d9e0dc', error: '#a52131',
} as const;

export const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, justifyContent: 'center', padding: 24 }, card: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 28, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border }, eyebrow: { color: colors.accent, fontWeight: '700', letterSpacing: 2, marginBottom: 20 }, title: { fontSize: 30, fontWeight: '700', color: colors.text }, copy: { fontSize: 16, lineHeight: 24, color: colors.muted, marginVertical: 16 }, label: { color: colors.text, marginBottom: 8, fontWeight: '600' }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, marginBottom: 18, fontSize: 16, color: colors.text }, button: { backgroundColor: colors.accent, borderRadius: 10, padding: 16, alignItems: 'center' }, buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 }, error: { color: colors.error, marginTop: 16 } });
