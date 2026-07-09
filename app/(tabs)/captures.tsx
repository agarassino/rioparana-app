import { View, Text, StyleSheet, Pressable } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { Card } from '../../src/components/ui';

export default function CapturesScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Pressable style={styles.addButton}>
          <FontAwesome6 name="plus" size={20} color="#fff" />
          <Text style={styles.addButtonText}>Registrar captura</Text>
        </Pressable>

        <View style={styles.emptyState}>
          <FontAwesome6 name="fish" size={64} color="#d1d5db" />
          <Text style={styles.emptyTitle}>Sin capturas aún</Text>
          <Text style={styles.emptyText}>
            Registrá tu primera captura para llevar un historial de tus pescas
          </Text>
        </View>

        <Card>
          <View style={styles.tipRow}>
            <FontAwesome6 name="lightbulb" size={20} color="#eab308" />
            <View style={styles.tipText}>
              <Text style={styles.tipTitle}>Consejo</Text>
              <Text style={styles.tipDesc}>
                Registrá las condiciones del río y clima con cada captura para identificar los mejores momentos para pescar.
              </Text>
            </View>
          </View>
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { flex: 1, padding: 16 },
  addButton: {
    backgroundColor: '#0ea5e9',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', marginLeft: 8 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#374151', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 8, paddingHorizontal: 32 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start' },
  tipText: { flex: 1, marginLeft: 12 },
  tipTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  tipDesc: { fontSize: 13, color: '#6b7280', marginTop: 4 },
});
